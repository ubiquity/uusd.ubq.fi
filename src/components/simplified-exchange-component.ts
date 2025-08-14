import { parseEther, formatEther, type Address } from "viem";
import type { WalletService } from "../services/wallet-service.ts";
import type { ContractService, ProtocolSettings } from "../services/contract-service.ts";
import type { PriceService } from "../services/price-service.ts";
import type { CurvePriceService } from "../services/curve-price-service.ts";
import type { TransactionService } from "../services/transaction-service.ts";
import type { SwapService } from "../services/swap-service.ts";
import { TransactionStateService } from "../services/transaction-state-service.ts";
import { OptimalRouteService, type OptimalRouteResult, type ExchangeDirection } from "../services/optimal-route-service.ts";
import { LUSD_COLLATERAL } from "../contracts/constants.ts";
import type { NotificationManager } from "./notification-manager.ts";
import type { InventoryBarComponent } from "./inventory-bar-component.ts";
import { getMaxTokenBalance, hasAvailableBalance } from "../utils/balance-utils.ts";

interface SimplifiedExchangeServices {
  walletService: WalletService;
  contractService: ContractService;
  priceService: PriceService;
  curvePriceService: CurvePriceService;
  transactionService: TransactionService;
  swapService: SwapService;
  notificationManager: NotificationManager;
  inventoryBar: InventoryBarComponent;
}

/**
 * Simplified Exchange Component
 * Clean, minimal interface that automatically handles the best route
 */
export class SimplifiedExchangeComponent {
  private _services: SimplifiedExchangeServices;
  private _optimalRouteService: OptimalRouteService;
  private _transactionStateService: TransactionStateService;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _renderDebounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Simplified state
  private _state = {
    direction: "deposit" as ExchangeDirection,
    amount: "",
    useUbqDiscount: false,
    forceSwapOnly: false,
    redemptionsDisabled: false, // Track protocol redemption status separately
    protocolSettings: null as ProtocolSettings | null,
    routeResult: null as OptimalRouteResult | null,
    isCalculating: false,
  };

  constructor(services: SimplifiedExchangeServices) {
    this._services = services;
    this._transactionStateService = TransactionStateService.getInstance();
    this._optimalRouteService = new OptimalRouteService(services.priceService, services.curvePriceService, services.contractService, services.walletService);

    void this._init();
  }

  private async _init() {
    await this._loadProtocolSettings();

    // ALWAYS check redemption status on init so state is correct from the start

    await this._checkRedemptionStatus();

    this._registerTransactionButton();
    this._setupEventListeners();
    this._setupWalletEventListeners();
    this._setupBalanceSubscription();

    // Wait for initial balance load if wallet is connected
    if (this._isWalletConnected()) {
      await this._services.inventoryBar.waitForInitialLoad();
    }

    this._render();

    // Auto-populate on initial load if wallet is connected
    if (this._isWalletConnected()) {
      // Balances are guaranteed to be loaded now
      this._autoPopulateMaxBalance();
    }

    // Periodically refresh protocol settings and redemption status (every 30 seconds)
    setInterval(async () => {
      await this._loadProtocolSettings();
      await this._checkRedemptionStatus();

      // Only re-render options if on withdraw view
      if (this._state.direction === "withdraw") {
        this._renderOptions();
      }
    }, 30000);
  }

  /**
   * Load protocol settings and determine available options
   */
  private async _loadProtocolSettings() {
    try {
      const settings = await this._services.contractService.getProtocolSettings(LUSD_COLLATERAL.index);
      this._state.protocolSettings = settings;
    } catch (error) {
      console.error("Failed to load protocol settings:", error);
    }
  }

  private _isWalletConnected(): boolean {
    return !!this._services.walletService.getAccount();
  }

  private _setupWalletEventListeners() {
    this._services.walletService.setEventHandlers({
      onConnect: async (_account: Address) => {
        // Clear state and re-evaluate on wallet connect
        this._state.amount = "";
        this._state.routeResult = null;

        // Wait for balances to load before rendering
        await this._services.inventoryBar.waitForInitialLoad();

        this._render();
        this._autoPopulateMaxBalance();
      },
      onDisconnect: () => {
        // Clear all state on disconnect
        this._state.amount = "";
        this._state.routeResult = null;
        this._state.direction = "deposit"; // Reset to default
        const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
        if (amountInput) amountInput.value = "";
        this._render();
      },
      onAccountChanged: async (account: Address | null) => {
        // Clear state and force re-evaluation when switching accounts
        this._state.amount = "";
        this._state.routeResult = null;
        const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
        if (amountInput) amountInput.value = "";

        // If connected, wait for balance load
        if (account) {
          await this._services.inventoryBar.waitForInitialLoad();
        }

        // Force a fresh render that will auto-select the correct direction
        this._render();

        // If connected, auto-populate balance for the new account
        if (account) {
          this._autoPopulateMaxBalance();
        }
      },
    });
  }

  /**
   * Setup event listeners
   */
  private _setupEventListeners() {
    // Use requestAnimationFrame to ensure DOM is ready
    const setupListeners = () => {
      const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
      const depositButton = document.getElementById("depositButton") as HTMLButtonElement;
      const withdrawButton = document.getElementById("withdrawButton") as HTMLButtonElement;
      const ubqDiscountCheckbox = document.getElementById("useUbqDiscount") as HTMLInputElement;
      const swapOnlyCheckbox = document.getElementById("forceSwapOnly") as HTMLInputElement;

      // Check if critical elements exist, if not retry
      if (!amountInput || !depositButton || !withdrawButton) {
        requestAnimationFrame(setupListeners);
        return;
      }

      if (amountInput) {
        amountInput.addEventListener("input", () => this._handleAmountChange());
      }

      if (depositButton) {
        depositButton.addEventListener("click", () => this._switchDirection("deposit"));
      }

      if (withdrawButton) {
        withdrawButton.addEventListener("click", () => this._switchDirection("withdraw"));
      }

      if (ubqDiscountCheckbox) {
        ubqDiscountCheckbox.addEventListener("change", (e) => {
          this._state.useUbqDiscount = (e.target as HTMLInputElement).checked;
          void this._calculateRoute();
        });
      }

      if (swapOnlyCheckbox) {
        swapOnlyCheckbox.addEventListener("change", (e) => {
          // CRITICAL: Never allow user to change this when redemptions are disabled
          if (this._state.redemptionsDisabled) {
            console.warn("Redemptions disabled - ignoring user checkbox change");
            e.preventDefault();
            e.stopPropagation();
            // Force checkbox back to checked state
            swapOnlyCheckbox.checked = true;
            return;
          }

          // Only allow changes when redemptions are enabled
          this._state.forceSwapOnly = (e.target as HTMLInputElement).checked;
          void this._calculateRoute();
        });
      }
    };

    requestAnimationFrame(setupListeners);
  }

  /**
   * Handle amount input changes
   */
  private _handleAmountChange() {
    const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
    this._state.amount = amountInput?.value || "";

    // Debounce calculation
    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    this._debounceTimer = setTimeout(() => {
      void this._calculateRoute();
    }, 300);
  }

  /**
   * Switch between buy and sell
   */
  private async _switchDirection(direction: ExchangeDirection) {
    // Clear current state
    this._state.direction = direction;
    this._state.amount = "";
    this._state.routeResult = null;

    // Clear input
    const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
    if (amountInput) amountInput.value = "";

    // IMPORTANT: Never reset redemptionsDisabled - it's a protocol state, not a UI state!
    // Only reset forceSwapOnly for deposits (user preference)
    if (direction === "deposit") {
      this._state.forceSwapOnly = false;
    }

    // For withdrawals, ensure checkbox is hidden if redemptions are disabled
    if (direction === "withdraw" && this._state.redemptionsDisabled) {
      // Force the state
      this._state.forceSwapOnly = true;

      // Hide checkbox IMMEDIATELY
      const swapOnlyDiv = document.getElementById("swapOnlyOption");
      if (swapOnlyDiv) {
        swapOnlyDiv.style.display = "none";
        swapOnlyDiv.style.visibility = "hidden";
      }
    }

    // Re-render UI
    this._render();

    // Auto-populate with max balance if available
    this._autoPopulateMaxBalance();
  }

  /**
   * Calculate the optimal route
   */
  private async _calculateRoute() {
    const amount = this._state.amount;
    if (!amount || amount === "0") {
      this._state.routeResult = null;
      this._renderOutput();
      return;
    }

    this._state.isCalculating = true;

    try {
      const inputAmount = parseEther(amount);
      let routeResult: OptimalRouteResult;

      if (this._state.direction === "deposit") {
        // For deposits, check if UBQ discount is available and user wants it
        const shouldForceCollateralOnly = !this._state.useUbqDiscount;
        routeResult = await this._optimalRouteService.getOptimalDepositRoute(inputAmount, shouldForceCollateralOnly);
      } else {
        // For withdrawals, ALWAYS use forceSwapOnly when redemptions are disabled
        const shouldForceSwap = this._state.redemptionsDisabled || this._state.forceSwapOnly;

        routeResult = await this._optimalRouteService.getOptimalWithdrawRoute(inputAmount, shouldForceSwap);
      }

      this._state.routeResult = routeResult;
    } catch (error) {
      console.error("Error calculating route:", error);
      this._state.routeResult = null;
    }

    this._state.isCalculating = false;
    this._renderOutput();
  }

  /**
   * Debounced render to prevent rapid UI updates
   */
  private _debouncedRender(immediate: boolean = false) {
    if (this._renderDebounceTimer) {
      clearTimeout(this._renderDebounceTimer);
    }

    if (immediate) {
      this._render();
    } else {
      this._renderDebounceTimer = setTimeout(() => {
        this._render();
        this._renderDebounceTimer = null;
      }, 50);
    }
  }

  /**
   * Render the main UI
   */
  private _render() {
    const isConnected = this._isWalletConnected();

    // Get main exchange interface elements
    const exchangeContainer = document.querySelector(".exchange-container") as HTMLElement;
    const depositButton = document.getElementById("depositButton") as HTMLButtonElement;
    const withdrawButton = document.getElementById("withdrawButton") as HTMLButtonElement;

    // Hide entire exchange interface when wallet is not connected
    if (!isConnected) {
      if (exchangeContainer) {
        exchangeContainer.style.display = "none";
      }
      // Clear any visible output
      const outputSection = document.getElementById("exchangeOutput");
      if (outputSection) outputSection.style.display = "none";
      return;
    }

    // Check if balances are still loading
    const isBalancesLoading = !this._services.inventoryBar.isInitialLoadComplete();

    // Show exchange interface when connected
    if (exchangeContainer) {
      exchangeContainer.style.display = "block";
    }

    console.log("[RENDER] Button visibility:", {
      isConnected,
      isBalancesLoading,
      depositExists: !!depositButton,
      withdrawExists: !!withdrawButton,
      depositHidden: depositButton?.style.display === "none",
      withdrawHidden: withdrawButton?.style.display === "none",
    });

    if (depositButton && withdrawButton) {
      if (isBalancesLoading) {
        // While loading, show both buttons but disabled
        depositButton.style.display = "block";
        withdrawButton.style.display = "block";
        depositButton.disabled = true;
        withdrawButton.disabled = true;
        depositButton.textContent = "Loading...";
        withdrawButton.textContent = "Loading...";
      } else {
        // Enable buttons
        depositButton.disabled = false;
        withdrawButton.disabled = false;
        depositButton.textContent = "Buy UUSD";
        withdrawButton.textContent = "Sell UUSD";

        const hasLUSD = hasAvailableBalance(this._services.inventoryBar, "LUSD");
        const hasUUSD = hasAvailableBalance(this._services.inventoryBar, "UUSD");

        depositButton.style.display = hasLUSD ? "block" : "none";
        withdrawButton.style.display = hasUUSD ? "block" : "none";

        // Auto-select the visible direction if only one is available
        if (hasLUSD && !hasUUSD) {
          this._state.direction = "deposit";
        } else if (hasUUSD && !hasLUSD) {
          this._state.direction = "withdraw";
        }

        depositButton.classList.toggle("active", this._state.direction === "deposit");
        withdrawButton.classList.toggle("active", this._state.direction === "withdraw");
      }
    }

    // Update input label
    const amountLabel = document.getElementById("amountLabel");
    const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;

    if (amountLabel) {
      amountLabel.textContent = this._state.direction === "deposit" ? "LUSD" : "UUSD";
    }

    if (amountInput) {
      if (isBalancesLoading) {
        amountInput.disabled = true;
        amountInput.placeholder = "Loading balances...";
      } else {
        amountInput.disabled = false;
        amountInput.placeholder = this._state.direction === "deposit" ? "Enter LUSD amount" : "Enter UUSD amount";
      }
    }

    // Show/hide options based on protocol state and direction
    this._renderOptions();
    this._renderOutput();
  }

  /**
   * Check redemption status and update state
   */
  private async _checkRedemptionStatus() {
    try {
      // Check if redemptions are allowed
      const testAmount = parseEther("1"); // Test with 1 UUSD

      const redeemResult = await this._services.priceService.calculateRedeemOutput({
        dollarAmount: testAmount,
        collateralIndex: LUSD_COLLATERAL.index,
      });

      console.log("[REDEMPTION CHECK] Result from calculateRedeemOutput:", {
        isRedeemingAllowed: redeemResult.isRedeemingAllowed,
        raw: redeemResult,
      });

      // Update redemption disabled state
      this._state.redemptionsDisabled = !redeemResult.isRedeemingAllowed;

      // Force swap-only if redemptions are disabled
      if (this._state.redemptionsDisabled) {
        this._state.forceSwapOnly = true;

        // Immediately hide and disable the checkbox
        const swapOnlyDiv = document.getElementById("swapOnlyOption");
        const swapOnlyCheckbox = document.getElementById("forceSwapOnly") as HTMLInputElement;

        if (swapOnlyDiv) {
          swapOnlyDiv.style.display = "none";
        }

        if (swapOnlyCheckbox) {
          swapOnlyCheckbox.checked = true;
          swapOnlyCheckbox.disabled = true;
        }
      } else {
        // Only reset if redemptions are enabled
        this._state.redemptionsDisabled = false;
        this._state.forceSwapOnly = false;
      }
    } catch (error) {
      console.error("[REDEMPTION CHECK] Error caught:", error);
      // On error, assume redemptions are disabled to be safe
      this._state.redemptionsDisabled = true;
      this._state.forceSwapOnly = true;

      // Hide checkbox on error too
      const swapOnlyDiv = document.getElementById("swapOnlyOption");
      if (swapOnlyDiv) {
        swapOnlyDiv.style.display = "none";
      }
    }

    console.log("[REDEMPTION CHECK] Complete. Final State:", {
      redemptionsDisabled: this._state.redemptionsDisabled,
      forceSwapOnly: this._state.forceSwapOnly,
    });
  }

  /**
   * Render options based on protocol state
   */
  private _renderOptions() {
    console.log("[RENDER OPTIONS] Starting render with state:", {
      direction: this._state.direction,
      redemptionsDisabled: this._state.redemptionsDisabled,
      forceSwapOnly: this._state.forceSwapOnly,
    });

    const ubqOptionDiv = document.getElementById("ubqDiscountOption");
    const swapOnlyDiv = document.getElementById("swapOnlyOption");
    const swapOnlyCheckbox = document.getElementById("forceSwapOnly") as HTMLInputElement;

    if (!this._state.protocolSettings) {
      // Hide all options if settings not loaded
      if (ubqOptionDiv) ubqOptionDiv.style.display = "none";
      if (swapOnlyDiv) swapOnlyDiv.style.display = "none";
      return;
    }

    if (this._state.direction === "deposit") {
      // For deposits: Show UBQ discount option only if protocol is fractional (not 100% collateralized)
      if (ubqOptionDiv) {
        const shouldShowUbqOption = this._state.protocolSettings.isFractional;
        ubqOptionDiv.style.display = shouldShowUbqOption ? "block" : "none";
      }

      // Hide swap-only option for deposits
      if (swapOnlyDiv) {
        swapOnlyDiv.style.display = "none";
      }
    } else {
      // For withdrawals: Check redemption status
      if (this._state.redemptionsDisabled) {
        // REDEMPTIONS DISABLED - HIDE EVERYTHING, NO USER CHOICE

        if (swapOnlyDiv) {
          swapOnlyDiv.style.display = "none";
          swapOnlyDiv.style.visibility = "hidden"; // Extra safety
        }

        if (swapOnlyCheckbox) {
          swapOnlyCheckbox.checked = true;
          swapOnlyCheckbox.disabled = true;
          // Remove any event listeners to prevent interaction
          const newCheckbox = swapOnlyCheckbox.cloneNode(true) as HTMLInputElement;
          swapOnlyCheckbox.parentNode?.replaceChild(newCheckbox, swapOnlyCheckbox);
        }
      } else {
        // REDEMPTIONS ENABLED - Show option for user choice

        if (swapOnlyDiv && swapOnlyCheckbox) {
          swapOnlyDiv.style.display = "block";
          swapOnlyDiv.style.visibility = "visible";
          swapOnlyCheckbox.disabled = false;
          swapOnlyCheckbox.checked = this._state.forceSwapOnly;

          const label = swapOnlyDiv.querySelector('label[for="forceSwapOnly"]');
          if (label) {
            label.textContent = "Use Curve swap only";
          }
        }
      }

      // Hide UBQ option for withdrawals
      if (ubqOptionDiv) {
        ubqOptionDiv.style.display = "none";
      }
    }

    console.log("[RENDER OPTIONS] Complete. DOM state:", {
      swapOnlyDisplay: swapOnlyDiv?.style.display,
      swapOnlyVisibility: swapOnlyDiv?.style.visibility,
      checkboxChecked: swapOnlyCheckbox?.checked,
      checkboxDisabled: swapOnlyCheckbox?.disabled,
    });
  }

  private _renderNoTokensState() {
    const exchangeContainer = document.querySelector(".exchange-container");
    const amountInput = document.getElementById("amountInput") as HTMLInputElement;
    const executeButton = document.getElementById("executeButton") as HTMLButtonElement;

    if (amountInput) {
      amountInput.disabled = true;
      amountInput.placeholder = "No tokens available";
      amountInput.value = "";
    }

    if (executeButton) {
      executeButton.disabled = true;
      executeButton.textContent = "Connect wallet with tokens to continue";
    }

    let noTokensMessage = document.getElementById("noTokensMessage");
    if (!noTokensMessage) {
      noTokensMessage = document.createElement("div");
      noTokensMessage.id = "noTokensMessage";
      noTokensMessage.className = "no-tokens-message";
      noTokensMessage.innerHTML = `
                <p>No LUSD or UUSD tokens found in your wallet.</p>
                <p>Please acquire tokens to use the exchange.</p>
            `;

      if (exchangeContainer) {
        exchangeContainer.appendChild(noTokensMessage);
      }
    }

    noTokensMessage.style.display = "block";
  }

  /**
   * Render the output section
   */
  private _renderOutput() {
    const outputSection = document.getElementById("exchangeOutput");
    const button = document.getElementById("exchangeButton") as HTMLButtonElement;

    if (!outputSection || !button) return;

    // Hide output if no route calculated
    if (!this._state.routeResult || !this._state.amount) {
      outputSection.style.display = "none";
      button.textContent = "Enter amount to continue";
      button.disabled = true;
      return;
    }

    // Show output
    outputSection.style.display = "block";

    // Update expected output
    const expectedOutputEl = document.getElementById("expectedOutput");
    if (expectedOutputEl) {
      const outputToken = this._state.direction === "deposit" ? "UUSD" : "LUSD";
      let outputText = `${formatEther(this._state.routeResult.expectedOutput)} ${outputToken}`;

      // Add UBQ if it's part of the transaction
      if (this._state.routeResult.isUbqOperation && this._state.routeResult.ubqAmount) {
        if (this._state.direction === "withdraw") {
          outputText += ` + ${formatEther(this._state.routeResult.ubqAmount)} UBQ`;
        }
      }

      expectedOutputEl.textContent = outputText;
    }

    // // Update route type indicator
    // const routeIndicator = document.getElementById('routeIndicator');
    // if (routeIndicator) {
    //     const routeText = this._getRouteTypeText(this._state.routeResult.routeType);
    //     routeIndicator.textContent = routeText;
    // }

    // Update button
    void this._updateActionButton();
  }

  /**
   * Get human-readable route type text
   */
  private _getRouteTypeText(routeType: string): string {
    switch (routeType) {
      case "mint":
        return "🔨 Protocol Mint";
      case "redeem":
        return "🔄 Protocol Redeem";
      case "swap":
        return "🔀 Curve Swap";
      default:
        return "";
    }
  }

  /**
   * Update action button based on wallet state and approvals
   */
  private async _updateActionButton() {
    const button = document.getElementById("exchangeButton") as HTMLButtonElement;
    if (!button || !this._state.routeResult) return;

    const account = this._services.walletService.getAccount();

    if (!account) {
      button.textContent = "Connect wallet first";
      button.disabled = true;
      return;
    }

    if (!this._state.routeResult.isEnabled) {
      button.textContent = "Route not available";
      button.disabled = true;
      return;
    }

    // Check approvals
    let hasNeedsApproval = false;
    let approvalToken = "";

    try {
      if (this._state.routeResult.routeType === "mint") {
        const mintResult = await this._services.priceService.calculateMintOutput({
          dollarAmount: this._state.routeResult.inputAmount,
          collateralIndex: LUSD_COLLATERAL.index,
          isForceCollateralOnly: !this._state.useUbqDiscount,
        });

        const approvalStatus = await this._services.transactionService.getMintApprovalStatus(LUSD_COLLATERAL, account, mintResult);
        hasNeedsApproval = approvalStatus.needsCollateralApproval || approvalStatus.needsGovernanceApproval;
        approvalToken = approvalStatus.needsCollateralApproval ? "LUSD" : "UBQ";
      } else if (this._state.routeResult.routeType === "redeem") {
        const allowance = await this._services.transactionService.getRedeemApprovalStatus(account, this._state.routeResult.inputAmount);
        hasNeedsApproval = allowance.needsApproval;
        approvalToken = "UUSD";
      } else if (this._state.routeResult.routeType === "swap") {
        const fromToken = this._state.direction === "deposit" ? "LUSD" : "UUSD";
        const tokenAddress =
          fromToken === "LUSD" ? ("0x5f98805A4E8be255a32880FDeC7F6728C6568bA0" as Address) : ("0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103" as Address);
        const poolAddress = this._services.swapService.getPoolAddress();

        const allowance = await this._services.contractService.getAllowance(tokenAddress, account, poolAddress);
        hasNeedsApproval = allowance < this._state.routeResult.inputAmount;
        approvalToken = fromToken;
      }
    } catch (error) {
      console.error("Error checking approvals:", error);
    }

    // Update button text
    if (hasNeedsApproval) {
      button.textContent = `Approve ${approvalToken}`;
    } else {
      const actionVerb = this._state.direction === "deposit" ? "Buy UUSD" : "Sell UUSD";
      button.textContent = actionVerb;
    }

    button.disabled = false;
  }

  /**
   * Execute the transaction
   */
  async executeTransaction(): Promise<void> {
    this._transactionStateService.startTransaction("exchangeButton");

    if (!this._services.walletService.isConnected()) {
      this._transactionStateService.errorTransaction("exchangeButton", "Wallet not connected", "❌ Connect Wallet");
      this._services.notificationManager.showError("exchange", "Please connect wallet first");
      return;
    }

    if (!this._state.routeResult) {
      this._transactionStateService.errorTransaction("exchangeButton", "No route calculated", "❌ Calculate Route");
      return;
    }

    try {
      const result = this._state.routeResult;

      switch (result.routeType) {
        case "mint":
          await this._services.transactionService.executeMint({
            collateralIndex: LUSD_COLLATERAL.index,
            dollarAmount: result.inputAmount,
            isForceCollateralOnly: !this._state.useUbqDiscount,
          });
          break;

        case "redeem":
          await this._services.transactionService.executeRedeem({
            collateralIndex: LUSD_COLLATERAL.index,
            dollarAmount: result.inputAmount,
          });
          break;

        case "swap":
          const fromToken = this._state.direction === "deposit" ? ("LUSD" as const) : ("UUSD" as const);
          const toToken = this._state.direction === "deposit" ? ("UUSD" as const) : ("LUSD" as const);

          await this._services.swapService.executeSwap({
            fromToken,
            toToken,
            amountIn: result.inputAmount,
            minAmountOut: (result.expectedOutput * 995n) / 1000n, // 0.5% slippage
            slippageTolerance: 0.005,
          });
          break;
      }

      // Success - clear form
      this._handleTransactionSuccess();
    } catch (error: unknown) {
      this._handleTransactionError(error as Error);
    }
  }

  /**
   * Handle transaction success
   */
  private _handleTransactionSuccess() {
    const direction = this._state.direction === "deposit" ? "Bought" : "Sold";
    this._transactionStateService.completeTransaction("exchangeButton", `✅ ${direction}!`);

    this._services.notificationManager.showSuccess(
      "exchange",
      `Successfully ${direction.toLowerCase()} ${this._state.amount} ${this._state.direction === "deposit" ? "LUSD" : "UUSD"}!`
    );

    // Clear form
    this._state.amount = "";
    this._state.routeResult = null;
    const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
    if (amountInput) amountInput.value = "";
    this._renderOutput();
  }

  /**
   * Handle transaction error
   */
  private _handleTransactionError(error: Error) {
    this._transactionStateService.errorTransaction("exchangeButton", error.message, "❌ Try Again");
    this._services.notificationManager.showError("exchange", error.message || "Transaction failed");
    void this._updateActionButton();
  }

  /**
   * Register transaction button
   */
  private _registerTransactionButton() {
    setTimeout(() => {
      const button = document.getElementById("exchangeButton") as HTMLButtonElement;
      if (button) {
        // Set up direct click handler
        button.onclick = async () => {
          await this.executeTransaction();
        };

        // Also register with transaction state service for state management
        this._transactionStateService.registerButton("exchangeButton", {
          buttonElement: button,
          originalText: "Exchange",
          pendingText: "Processing...",
        });
      }
    }, 100);
  }

  /**
   * Setup balance subscription for auto-populate
   */
  private _setupBalanceSubscription() {
    if (this._services.inventoryBar) {
      this._services.inventoryBar.onBalancesUpdated(() => {
        // Re-render the UI to update button visibility based on new balances
        this._render();
        this._autoPopulateMaxBalance();
      });
    }
  }

  /**
   * Auto-populate with max balance
   */
  private _autoPopulateMaxBalance(retryCount: number = 0) {
    if (!this._services.walletService.isConnected()) return;

    const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
    if (!amountInput) {
      // Retry if DOM element not ready (max 3 retries)
      if (retryCount < 3) {
        setTimeout(() => this._autoPopulateMaxBalance(retryCount + 1), 50);
      }
      return;
    }

    // Only auto-populate if input is empty or zero
    if (amountInput.value && amountInput.value !== "" && amountInput.value !== "0") return;

    try {
      const tokenSymbol = this._state.direction === "deposit" ? "LUSD" : "UUSD";
      if (hasAvailableBalance(this._services.inventoryBar, tokenSymbol)) {
        const maxBalance = getMaxTokenBalance(this._services.inventoryBar, tokenSymbol);
        amountInput.value = maxBalance;
        this._state.amount = maxBalance;
        void this._calculateRoute();
      } else if (retryCount < 3 && !this._services.inventoryBar.isInitialLoadComplete()) {
        // If balances not loaded yet, retry
        setTimeout(() => this._autoPopulateMaxBalance(retryCount + 1), 100);
      }
    } catch {
      // Silent fail
    }
  }

  /**
   * Handle wallet connection changes
   */
  updateWalletConnection(isConnected: boolean) {
    if (isConnected) {
      void this._loadProtocolSettings();
      void this._calculateRoute();
      // Wait for balances to load then re-render UI to update button visibility
      void this._services.inventoryBar.waitForInitialLoad().then(() => {
        this._render();
      });
    } else {
      this._state.routeResult = null;
      this._renderOutput();
      this._render();
    }
  }

  /**
   * Handle form submission
   */
  async handleSubmit(event: Event) {
    event.preventDefault();
    // Execute the transaction when form is submitted
    await this.executeTransaction();
  }

  // Transaction event handlers for app.ts integration
  handleTransactionStart() {
    this._transactionStateService.startTransaction("exchangeButton");
  }

  handleTransactionSubmitted(hash: string) {
    this._transactionStateService.updateTransactionHash("exchangeButton", hash);
  }
}
