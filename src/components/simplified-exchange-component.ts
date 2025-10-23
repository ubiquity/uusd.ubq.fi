import { parseEther, formatEther, type Address } from "viem";
import type { WalletService } from "../services/wallet-service.ts";
import type { ContractService, ProtocolSettings } from "../services/contract-service.ts";
import type { PriceService } from "../services/price-service.ts";
import type { CurvePriceService } from "../services/curve-price-service.ts";
import type { TransactionService } from "../services/transaction-service.ts";
import type { SwapService } from "../services/swap-service.ts";
import { TransactionStateService } from "../services/transaction-state-service.ts";
import { OptimalRouteService, type OptimalRouteResult, type ExchangeDirection } from "../services/optimal-route-service.ts";
import { WALLET_EVENTS } from "../services/wallet-service.ts";
import { LUSD_COLLATERAL, ADDRESSES } from "../contracts/constants.ts";
import type { NotificationManager } from "./notification-manager.ts";
import type { InventoryBarComponent } from "./inventory-bar-component.ts";
import { getMaxTokenBalance, hasAvailableBalance } from "../utils/balance-utils.ts";
import { DEFAULT_SLIPPAGE_PERCENT, DEFAULT_SLIPPAGE_BPS, BASIS_POINTS_DIVISOR } from "../constants/numeric-constants.ts";
import type { RefreshData } from "../services/centralized-refresh-service.ts";

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
    acceptFractionalRedemption: false,
    redemptionsDisabled: false,
    mintingDisabled: true,
    protocolSettings: null as ProtocolSettings | null,
    routeResult: null as OptimalRouteResult | null,
    isCalculating: false,
  };

  constructor(services: SimplifiedExchangeServices) {
    this._services = services;
    this._transactionStateService = TransactionStateService.getInstance();
    this._optimalRouteService = new OptimalRouteService(
      services.priceService, 
      services.curvePriceService, 
      services.contractService, 
      services.walletService
    );

    void this._init();
  }

  private async _init() {
    await this._loadProtocolSettings();
    await this._checkRedemptionStatus();
    this._updateFromCentralizedData();

    console.log("[SIMPLIFIED EXCHANGE] Initialized with addresses:", {
      diamond: ADDRESSES.DIAMOND,
      dollar: ADDRESSES.DOLLAR,
      governance: ADDRESSES.GOVERNANCE,
      curvePool: ADDRESSES.CURVE_POOL,
      lusdCollateral: LUSD_COLLATERAL.address
    });

    this._registerTransactionButton();
    this._setupEventListeners();
    this._setupWalletEventListeners();
    this._setupBalanceSubscription();

    if (this._isWalletConnected()) {
      await this._services.inventoryBar.waitForInitialLoad();
    }

    this._render();

    if (this._isWalletConnected()) {
      this._autoPopulateMaxBalance();
    }

    // Hide UBQ option if minting disabled on init
    if (this._state.direction === "deposit" && this._state.mintingDisabled) {
      this._hideUbqDiscountOption();
    }
  }

  /**
   * Update state from centralized refresh data
   */
  private _updateFromCentralizedData() {
    const app = (window as any).app;
    if (!app?.centralizedRefreshService) {
      console.warn("[SIMPLIFIED EXCHANGE] Centralized refresh service not available");
      return;
    }

    const refreshData = app.centralizedRefreshService.getLastData();
    if (refreshData) {
      this._state.mintingDisabled = !refreshData.isMintingAllowed;

      if (this._state.mintingDisabled) {
        this._state.useUbqDiscount = false;
        this._hideUbqDiscountOption();
      }

      console.log("[CENTRALIZED DATA] Updated state:", {
        mintingDisabled: this._state.mintingDisabled,
        isMintingAllowed: refreshData.isMintingAllowed
      });
    }

    app.centralizedRefreshService.subscribe((data: RefreshData) => {
      const previousMintingState = this._state.mintingDisabled;
      this._state.mintingDisabled = !data.isMintingAllowed;

      if (this._state.mintingDisabled && !previousMintingState) {
        this._state.useUbqDiscount = false;
        this._hideUbqDiscountOption();
      }

      if (this._state.direction === "deposit" && previousMintingState !== this._state.mintingDisabled) {
        console.log("[CENTRALIZED UPDATE] Minting state changed, re-rendering");
        this._renderOptions();
      }
    });
  }

  /**
   * Load protocol settings
   */
  private async _loadProtocolSettings() {
    try {
      const settings = await this._services.contractService.getProtocolSettings(LUSD_COLLATERAL.index);
      this._state.protocolSettings = settings;
      console.log("[PROTOCOL SETTINGS] Loaded:", settings);
    } catch (error) {
      console.error("Failed to load protocol settings:", error);
    }
  }

  private _isWalletConnected(): boolean {
    return this._services.walletService.isConnected();
  }

  private _setupWalletEventListeners() {
    this._services.walletService.addEventListener(WALLET_EVENTS.CONNECT, async (account?: Address | null) => {
      console.log("[WALLET] Connected:", account);
      this._state.amount = "";
      this._state.routeResult = null;

      await this._services.inventoryBar.waitForInitialLoad();
      this._render();
      this._autoPopulateMaxBalance();
    });

    this._services.walletService.addEventListener(WALLET_EVENTS.DISCONNECT, () => {
      console.log("[WALLET] Disconnected");
      this._state.amount = "";
      this._state.routeResult = null;
      this._state.direction = "deposit";
      
      const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
      if (amountInput) amountInput.value = "";
      
      this._render();
    });

    this._services.walletService.addEventListener(WALLET_EVENTS.ACCOUNT_CHANGED, async (account?: Address | null) => {
      console.log("[WALLET] Account changed:", account);
      this._state.amount = "";
      this._state.routeResult = null;
      
      const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
      if (amountInput) amountInput.value = "";

      if (account) {
        await this._services.inventoryBar.waitForInitialLoad();
      }

      this._render();

      if (account) {
        this._autoPopulateMaxBalance();
      }
    });
  }

  /**
   * Setup event listeners for UI elements
   */
  private _setupEventListeners() {
    const setupListeners = () => {
      const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
      const depositButton = document.getElementById("depositButton") as HTMLButtonElement;
      const withdrawButton = document.getElementById("withdrawButton") as HTMLButtonElement;
      const ubqDiscountCheckbox = document.getElementById("useUbqDiscount") as HTMLInputElement;
      const swapOnlyCheckbox = document.getElementById("forceSwapOnly") as HTMLInputElement;
      const fractionalRedemptionCheckbox = document.getElementById("acceptFractionalRedemption") as HTMLInputElement;

      if (!amountInput || !depositButton || !withdrawButton) {
        requestAnimationFrame(setupListeners);
        return;
      }

      // Amount input
      amountInput.addEventListener("input", () => this._handleAmountChange());

      // Direction buttons
      depositButton.addEventListener("click", () => this._switchDirection("deposit"));
      withdrawButton.addEventListener("click", () => this._switchDirection("withdraw"));

      // UBQ discount
      if (ubqDiscountCheckbox) {
        ubqDiscountCheckbox.addEventListener("change", async (e) => {
          if (this._state.direction === "deposit" && this._state.mintingDisabled) {
            console.warn("[UBQ DISCOUNT] Minting disabled - preventing selection");
            e.preventDefault();
            (e.target as HTMLInputElement).checked = false;
            this._state.useUbqDiscount = false;
            this._hideUbqDiscountOption();
            return;
          }

          this._state.useUbqDiscount = (e.target as HTMLInputElement).checked;
          void this._calculateRoute();
        });
      }

      // Swap only option
      if (swapOnlyCheckbox) {
        swapOnlyCheckbox.addEventListener("change", (e) => {
          if (this._state.redemptionsDisabled) {
            console.warn("Redemptions disabled - ignoring checkbox change");
            e.preventDefault();
            e.stopPropagation();
            swapOnlyCheckbox.checked = true;
            return;
          }

          this._state.forceSwapOnly = (e.target as HTMLInputElement).checked;
          void this._calculateRoute();
        });
      }

      // Fractional redemption
      if (fractionalRedemptionCheckbox) {
        fractionalRedemptionCheckbox.addEventListener("change", (e) => {
          this._state.acceptFractionalRedemption = (e.target as HTMLInputElement).checked;
          void this._calculateRoute();
        });
      }
    };

    requestAnimationFrame(setupListeners);
  }

  /**
   * Handle amount input changes with debounce
   */
  private _handleAmountChange() {
    const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
    this._state.amount = amountInput?.value || "";

    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    this._debounceTimer = setTimeout(() => {
      void this._calculateRoute();
    }, 150);
  }

  /**
   * Switch between deposit and withdraw directions
   */
  private async _switchDirection(direction: ExchangeDirection) {
    console.log("[DIRECTION] Switching to:", direction);
    
    this._state.direction = direction;
    this._state.amount = "";
    this._state.routeResult = null;

    const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
    if (amountInput) amountInput.value = "";

    // Reset options based on direction
    if (direction === "deposit") {
      this._state.forceSwapOnly = false;
    } else {
      // For withdrawals, enforce swap-only if redemptions disabled
      if (this._state.redemptionsDisabled) {
        this._state.forceSwapOnly = true;
        this._hideSwapOnlyOption();
      }
    }

    this._render();
    this._autoPopulateMaxBalance();
  }

  /**
   * Calculate optimal route based on current state
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
        const shouldForceCollateralOnly = !this._state.useUbqDiscount;
        routeResult = await this._optimalRouteService.getOptimalDepositRoute(inputAmount, shouldForceCollateralOnly);
      } else {
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
   * Check redemption status from protocol
   */
  private async _checkRedemptionStatus() {
    try {
      const testAmount = parseEther("1");
      const redeemResult = await this._services.priceService.calculateRedeemOutput({
        dollarAmount: testAmount,
        collateralIndex: LUSD_COLLATERAL.index,
      });

      console.log("[REDEMPTION CHECK] Result:", redeemResult);
      this._state.redemptionsDisabled = !redeemResult.isRedeemingAllowed;

      if (this._state.redemptionsDisabled) {
        this._state.forceSwapOnly = true;
        this._hideSwapOnlyOption();
      }
    } catch (error) {
      console.error("[REDEMPTION CHECK] Error:", error);
      this._state.redemptionsDisabled = true;
      this._state.forceSwapOnly = true;
      this._hideSwapOnlyOption();
    }
  }

  /**
   * Render the main UI
   */
  private _render() {
    const isConnected = this._isWalletConnected();
    const exchangeContainer = document.querySelector(".exchange-container") as HTMLElement;
    const depositButton = document.getElementById("depositButton") as HTMLButtonElement;
    const withdrawButton = document.getElementById("withdrawButton") as HTMLButtonElement;

    // Handle disconnected state
    if (!isConnected) {
      if (exchangeContainer) exchangeContainer.style.display = "none";
      const outputSection = document.getElementById("exchangeOutput");
      if (outputSection) outputSection.style.display = "none";
      return;
    }

    // Show exchange interface when connected
    if (exchangeContainer) exchangeContainer.style.display = "block";

    const isBalancesLoading = !this._services.inventoryBar.isInitialLoadComplete();

    // Update button states
    if (depositButton && withdrawButton) {
      if (isBalancesLoading) {
        depositButton.style.display = "block";
        withdrawButton.style.display = "block";
        depositButton.disabled = true;
        withdrawButton.disabled = true;
        depositButton.textContent = "Loading...";
        withdrawButton.textContent = "Loading...";
      } else {
        depositButton.disabled = false;
        withdrawButton.disabled = false;
        depositButton.textContent = "Buy UUSD";
        withdrawButton.textContent = "Sell UUSD";

        const hasLUSD = hasAvailableBalance(this._services.inventoryBar, "LUSD");
        const hasUUSD = hasAvailableBalance(this._services.inventoryBar, "UUSD");

        depositButton.style.display = hasLUSD ? "block" : "none";
        withdrawButton.style.display = hasUUSD ? "block" : "none";

        // Auto-select direction based on available balances
        if (hasLUSD && !hasUUSD) {
          this._state.direction = "deposit";
        } else if (hasUUSD && !hasLUSD) {
          this._state.direction = "withdraw";
        }

        depositButton.classList.toggle("active", this._state.direction === "deposit");
        withdrawButton.classList.toggle("active", this._state.direction === "withdraw");
      }
    }

    // Update input field
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

    this._renderOptions();
    this._renderOutput();
  }

  /**
   * Render options based on protocol state and direction
   */
  private _renderOptions() {
    console.log("[RENDER OPTIONS] Current state:", this._state);

    const ubqOptionDiv = document.getElementById("ubqDiscountOption");
    const swapOnlyDiv = document.getElementById("swapOnlyOption");
    const swapOnlyCheckbox = document.getElementById("forceSwapOnly") as HTMLInputElement;
    const fractionalRedemptionDiv = document.getElementById("fractionalRedemptionOption");
    const fractionalRedemptionCheckbox = document.getElementById("acceptFractionalRedemption") as HTMLInputElement;

    if (!this._state.protocolSettings) {
      if (ubqOptionDiv) ubqOptionDiv.style.display = "none";
      if (swapOnlyDiv) swapOnlyDiv.style.display = "none";
      if (fractionalRedemptionDiv) fractionalRedemptionDiv.style.display = "none";
      return;
    }

    if (this._state.direction === "deposit") {
      // Deposits: Show UBQ discount only if fractional and minting allowed
      if (ubqOptionDiv) {
        const shouldShowUbqOption = this._state.protocolSettings.isFractional && !this._state.mintingDisabled;
        ubqOptionDiv.style.display = shouldShowUbqOption ? "block" : "none";

        if (this._state.mintingDisabled) {
          const ubqDiscountCheckbox = document.getElementById("useUbqDiscount") as HTMLInputElement;
          if (ubqDiscountCheckbox) {
            ubqDiscountCheckbox.checked = false;
          }
        }
      }

      // Hide withdrawal options
      if (swapOnlyDiv) swapOnlyDiv.style.display = "none";
      if (fractionalRedemptionDiv) fractionalRedemptionDiv.style.display = "none";
    } else {
      // Withdrawals: Handle different protocol states
      const settings = this._state.protocolSettings;

      if (this._state.redemptionsDisabled) {
        // Redemptions disabled - force swap only
        this._state.forceSwapOnly = true;
        if (swapOnlyDiv) swapOnlyDiv.style.display = "none";
        if (fractionalRedemptionDiv) fractionalRedemptionDiv.style.display = "none";
        if (swapOnlyCheckbox) {
          swapOnlyCheckbox.checked = true;
          swapOnlyCheckbox.disabled = true;
        }
      } else if (settings.isFullyCollateralized) {
        // Fully collateralized - show swap vs redemption choice
        if (swapOnlyDiv && swapOnlyCheckbox) {
          swapOnlyDiv.style.display = "block";
          swapOnlyCheckbox.disabled = false;
          swapOnlyCheckbox.checked = this._state.forceSwapOnly;
        }
        if (fractionalRedemptionDiv) fractionalRedemptionDiv.style.display = "none";
      } else if (settings.isFractional) {
        // Fractionally collateralized - show fractional redemption option
        this._state.forceSwapOnly = !this._state.acceptFractionalRedemption;
        if (swapOnlyDiv) swapOnlyDiv.style.display = "none";
        if (fractionalRedemptionDiv && fractionalRedemptionCheckbox) {
          fractionalRedemptionDiv.style.display = "block";
          fractionalRedemptionCheckbox.checked = this._state.acceptFractionalRedemption;
        }
      }

      // Hide UBQ option for withdrawals
      if (ubqOptionDiv) ubqOptionDiv.style.display = "none";
    }
  }

  /**
   * Render output section with route results
   */
  private _renderOutput() {
    const outputSection = document.getElementById("exchangeOutput");
    const button = document.getElementById("exchangeButton") as HTMLButtonElement;

    if (!outputSection || !button) return;

    if (!this._state.routeResult || !this._state.amount) {
      outputSection.style.display = "none";
      button.textContent = "Enter amount to continue";
      button.disabled = true;
      return;
    }

    outputSection.style.display = "block";

    // Update expected output
    const expectedOutputEl = document.getElementById("expectedOutput");
    if (expectedOutputEl) {
      const outputToken = this._state.direction === "deposit" ? "UUSD" : "LUSD";
      let outputText = `${formatEther(this._state.routeResult.expectedOutput)} ${outputToken}`;

      if (this._state.routeResult.isUbqOperation && this._state.routeResult.ubqAmount) {
        if (this._state.direction === "withdraw") {
          outputText += ` + ${formatEther(this._state.routeResult.ubqAmount)} UBQ`;
        }
      }

      expectedOutputEl.textContent = outputText;
    }

    void this._updateActionButton();
  }

  /**
   * Update action button based on approvals and state
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

    // Check approval requirements
    let needsApproval = false;
    let approvalToken = "";

    try {
      if (this._state.routeResult.routeType === "mint") {
        const mintResult = await this._services.priceService.calculateMintOutput({
          dollarAmount: this._state.routeResult.inputAmount,
          collateralIndex: LUSD_COLLATERAL.index,
          isForceCollateralOnly: !this._state.useUbqDiscount,
        });

        const approvalStatus = await this._services.transactionService.getMintApprovalStatus(LUSD_COLLATERAL, account, mintResult);
        needsApproval = approvalStatus.needsCollateralApproval || approvalStatus.needsGovernanceApproval;
        approvalToken = approvalStatus.needsCollateralApproval ? "LUSD" : "UBQ";
      } else if (this._state.routeResult.routeType === "redeem") {
        const allowance = await this._services.transactionService.getRedeemApprovalStatus(account, this._state.routeResult.inputAmount);
        needsApproval = allowance.needsApproval;
        approvalToken = "UUSD";
      } else if (this._state.routeResult.routeType === "swap") {
        const fromToken = this._state.direction === "deposit" ? "LUSD" : "UUSD";
        const tokenAddress = fromToken === "LUSD" ? LUSD_COLLATERAL.address : ADDRESSES.DOLLAR;
        const poolAddress = ADDRESSES.CURVE_POOL;

        const allowance = await this._services.contractService.getAllowance(tokenAddress, account, poolAddress);
        needsApproval = allowance < this._state.routeResult.inputAmount;
        approvalToken = fromToken;
      }
    } catch (error) {
      console.error("Error checking approvals:", error);
    }

    // Update button text
    if (needsApproval) {
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
          const fromToken = this._state.direction === "deposit" ? "LUSD" as const : "UUSD" as const;
          const toToken = this._state.direction === "deposit" ? "UUSD" as const : "LUSD" as const;

          await this._services.swapService.executeSwap({
            fromToken,
            toToken,
            amountIn: result.inputAmount,
            minAmountOut: (result.expectedOutput * (BASIS_POINTS_DIVISOR - DEFAULT_SLIPPAGE_BPS)) / BASIS_POINTS_DIVISOR,
            slippageTolerance: DEFAULT_SLIPPAGE_PERCENT,
          });
          break;
      }

      this._handleTransactionSuccess();
    } catch (error: unknown) {
      this._handleTransactionError(error as Error);
    }
  }

  /**
   * Handle successful transaction
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

    // Refresh balances
    void this._services.inventoryBar.refreshBalances();
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
   * Register transaction button with state service
   */
  private _registerTransactionButton() {
    setTimeout(() => {
      const button = document.getElementById("exchangeButton") as HTMLButtonElement;
      if (button) {
        button.onclick = async () => {
          await this.executeTransaction();
        };

        this._transactionStateService.registerButton("exchangeButton", {
          buttonElement: button,
          originalText: "Exchange",
          pendingText: "Processing...",
        });
      }
    }, 100);
  }

  /**
   * Setup balance subscription for auto-refresh
   */
  private _setupBalanceSubscription() {
    if (this._services.inventoryBar) {
      this._services.inventoryBar.onBalancesUpdated(() => {
        this._render();
        this._autoPopulateMaxBalance();
      });
    }
  }

  private _autoPopulateRetryTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Auto-populate input with max balance
   */
  private _autoPopulateMaxBalance(retryCount: number = 0) {
    if (this._autoPopulateRetryTimeout) {
      clearTimeout(this._autoPopulateRetryTimeout);
      this._autoPopulateRetryTimeout = null;
    }

    if (!this._services.walletService.isConnected()) return;

    const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
    if (!amountInput) {
      if (retryCount < 3) {
        this._autoPopulateRetryTimeout = setTimeout(() => this._autoPopulateMaxBalance(retryCount + 1), 50);
      }
      return;
    }

    // Only auto-populate if input is empty
    if (amountInput.value && amountInput.value !== "" && amountInput.value !== "0") return;

    try {
      const tokenSymbol = this._state.direction === "deposit" ? "LUSD" : "UUSD";
      if (hasAvailableBalance(this._services.inventoryBar, tokenSymbol)) {
        const maxBalance = getMaxTokenBalance(this._services.inventoryBar, tokenSymbol);
        amountInput.value = maxBalance;
        this._state.amount = maxBalance;
        void this._calculateRoute();
      } else if (retryCount < 3 && !this._services.inventoryBar.isInitialLoadComplete()) {
        this._autoPopulateRetryTimeout = setTimeout(() => this._autoPopulateMaxBalance(retryCount + 1), 100);
      }
    } catch {
      // Silent fail
    }
  }

  // Helper methods to hide options
  private _hideUbqDiscountOption() {
    const ubqOptionDiv = document.getElementById("ubqDiscountOption");
    if (ubqOptionDiv) {
      ubqOptionDiv.style.display = "none";
    }
  }

  private _hideSwapOnlyOption() {
    const swapOnlyDiv = document.getElementById("swapOnlyOption");
    if (swapOnlyDiv) {
      swapOnlyDiv.style.display = "none";
    }
  }

  // Public methods for external integration
  updateWalletConnection(isConnected: boolean) {
    if (isConnected) {
      void this._loadProtocolSettings();
      void this._calculateRoute();
      void this._services.inventoryBar.waitForInitialLoad().then(() => {
        this._render();
      });
    } else {
      this._state.routeResult = null;
      this._renderOutput();
      this._render();
    }
  }

  async handleSubmit(event: Event) {
    event.preventDefault();
    await this.executeTransaction();
  }
  
  handleTransactionStart() {
    this._transactionStateService.startTransaction("exchangeButton");
  }

  handleTransactionSubmitted(hash: string) {
    this._transactionStateService.updateTransactionHash("exchangeButton", hash);
  }
}