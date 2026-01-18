import { parseEther, formatEther, type Address, parseUnits, formatUnits } from "viem";
import type { WalletService } from "../services/wallet-service.ts";
import type { ContractService, ProtocolSettings } from "../services/contract-service.ts";
import type { PriceService } from "../services/price-service.ts";
import type { CurvePriceService } from "../services/curve-price-service.ts";
import type { TransactionService } from "../services/transaction-service.ts";
import type { SwapService } from "../services/swap-service.ts";
import { TransactionStateService } from "../services/transaction-state-service.ts";
import { OptimalRouteService, type OptimalRouteResult, type ExchangeDirection } from "../services/optimal-route-service.ts";
import { WALLET_EVENTS } from "../services/wallet-service.ts";
import { LUSD_COLLATERAL } from "../contracts/constants.ts";
import type { NotificationManager } from "./notification-manager.ts";
import type { InventoryBarComponent } from "./inventory-bar-component.ts";
import { getMaxTokenBalance, hasAvailableBalance } from "../utils/balance-utils.ts";
import { DEFAULT_SLIPPAGE_PERCENT, DEFAULT_SLIPPAGE_BPS, BASIS_POINTS_DIVISOR } from "../constants/numeric-constants.ts";
import type { CentralizedRefreshService, RefreshData } from "../services/centralized-refresh-service.ts";
import { INVENTORY_TOKENS } from "../types/inventory.types.ts";
import { areAddressesEqual } from "../utils/format-utils.ts";
import type { CowSwapService } from "../services/cowswap-service.ts";

interface SimplifiedExchangeServices {
  walletService: WalletService;
  contractService: ContractService;
  priceService: PriceService;
  curvePriceService: CurvePriceService;
  transactionService: TransactionService;
  swapService: SwapService;
  notificationManager: NotificationManager;
  inventoryBar: InventoryBarComponent;
  centralizedRefreshService: CentralizedRefreshService;
  cowSwapService: CowSwapService;
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
    redemptionsDisabled: false, // Track protocol redemption status separately
    mintingDisabled: true, // Default to true until we verify minting is allowed
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
    this._initTokenSelectAndLabel();
    await this._loadProtocolSettings();

    // Check redemption status on init
    await this._checkRedemptionStatus();

    // Get minting status from centralized refresh service
    this._updateFromCentralizedData();

    console.log("[INIT] Initial state after status checks:", {
      mintingDisabled: this._state.mintingDisabled,
      redemptionsDisabled: this._state.redemptionsDisabled,
      direction: this._state.direction,
    });

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

    // If we're starting on deposit mode, immediately hide UBQ option if minting disabled
    if (this._state.direction === "deposit" && this._state.mintingDisabled) {
      const ubqOptionDiv = document.getElementById("ubqDiscountOption");
      if (ubqOptionDiv) {
        ubqOptionDiv.style.display = "none";
      }
    }

    // Protocol settings and redemption status are now handled by centralized refresh service
  }

  private _initTokenSelectAndLabel(removeExisting: boolean = false) {
    if (removeExisting) {
      const existingSelect = document.getElementById("tokenSelect");
      const existingLabel = document.getElementById("tokenLabel");
      if (existingSelect) {
        existingSelect.remove();
      }
      if (existingLabel) {
        existingLabel.remove();
      }
    }
    const inputDiv = document.getElementById("input");
    const outputDiv = document.getElementById("output");
    const ubqOutputEl = document.getElementById("ubqOutput");
    if (!inputDiv || !outputDiv || !ubqOutputEl) {
      console.error("Input or output div not found!");
      return;
    }

    const selectEl = document.createElement("select") as HTMLSelectElement;
    selectEl.id = "tokenSelect";
    selectEl.addEventListener("change", (e) => this._handleTokenSelect(e));

    const labelSpan = document.createElement("span");
    labelSpan.textContent = "UUSD";
    labelSpan.id = "tokenLabel";

    if (this._state.direction === "deposit") {
      inputDiv.insertBefore(selectEl, inputDiv.firstChild);
      outputDiv.insertBefore(labelSpan, ubqOutputEl);
    } else if (this._state.direction === "withdraw") {
      outputDiv.insertBefore(selectEl, ubqOutputEl);
      inputDiv.insertBefore(labelSpan, inputDiv.firstChild);
    }
  }

  private _renderTokenOptions() {
    const refreshData = this._services.centralizedRefreshService.getLastData();
    const selectEl = document.querySelector("#tokenSelect") as HTMLSelectElement;
    if (!selectEl) {
      return;
    }

    if (refreshData?.tokenBalances) {
      refreshData.tokenBalances.forEach((balance) => {
        if ([...selectEl.options].some((opt) => areAddressesEqual(opt.value as Address, balance.address))) {
          return; // Token already exists
        }
        const option = document.createElement("option");
        option.value = balance.address;
        option.setAttribute("data-decimals", balance.decimals.toString());
        option.setAttribute("data-symbol", balance.symbol);
        option.text = balance.symbol.substring(0, 10);
        selectEl.appendChild(option);
      });
      // Remove unused tokens
      [...selectEl.options].forEach((opt) => {
        if (!refreshData.tokenBalances?.some((balance) => areAddressesEqual(balance.address, opt.value as Address))) {
          selectEl.removeChild(opt);
        }
      });
    } else {
      selectEl.innerHTML = ""; // Clear existing options
      const option = document.createElement("option");
      option.value = INVENTORY_TOKENS.LUSD.address;
      option.setAttribute("data-decimals", INVENTORY_TOKENS.LUSD.decimals.toString());
      option.setAttribute("data-symbol", INVENTORY_TOKENS.LUSD.symbol);
      option.text = INVENTORY_TOKENS.LUSD.symbol;
      selectEl.appendChild(option);
    }
  }

  /**
   * Update state from centralized refresh data
   */
  private _updateFromCentralizedData() {
    const refreshData = this._services.centralizedRefreshService.getLastData();
    if (refreshData) {
      // Update minting disabled state from centralized data
      this._state.mintingDisabled = !refreshData.isMintingAllowed;

      // If minting is disabled, ensure UBQ discount is unchecked
      if (this._state.mintingDisabled) {
        this._state.useUbqDiscount = false;
      }

      console.log("[CENTRALIZED DATA] Updated minting state:", {
        mintingDisabled: this._state.mintingDisabled,
        isMintingAllowed: refreshData.isMintingAllowed,
        twapPrice: refreshData.twapPrice?.toString(),
        mintThreshold: refreshData.mintThreshold?.toString(),
      });
    }

    // Subscribe to updates
    this._services.centralizedRefreshService.subscribe((data: RefreshData) => {
      const didHaveMintingDisabled = this._state.mintingDisabled;
      this._state.mintingDisabled = !data.isMintingAllowed;

      // If minting became disabled, uncheck UBQ discount
      if (this._state.mintingDisabled && !didHaveMintingDisabled) {
        this._state.useUbqDiscount = false;
      }

      // Re-render if minting state changed and we're on deposit
      if (this._state.direction === "deposit" && didHaveMintingDisabled !== this._state.mintingDisabled) {
        console.log("[CENTRALIZED UPDATE] Minting state changed, re-rendering");
        this._renderOptions();
      }
    });
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
    this._services.walletService.addEventListener(WALLET_EVENTS.CONNECT, async (_account?: Address | null) => {
      // Clear state and re-evaluate on wallet connect
      this._state.amount = "";
      this._state.routeResult = null;

      // Wait for balances to load before rendering
      await this._services.centralizedRefreshService.forceRefresh();

      this._render();
      this._autoPopulateMaxBalance();
    });

    this._services.walletService.addEventListener(WALLET_EVENTS.DISCONNECT, async () => {
      // Clear all state on disconnect
      this._state.amount = "";
      this._state.routeResult = null;
      this._state.direction = "deposit"; // Reset to default
      const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
      if (amountInput) amountInput.value = "";
      await this._services.centralizedRefreshService.forceRefresh();
      this._render();
    });

    this._services.walletService.addEventListener(WALLET_EVENTS.ACCOUNT_CHANGED, async (account?: Address | null) => {
      // Clear state and force re-evaluation when switching accounts
      this._state.amount = "";
      this._state.routeResult = null;
      const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
      if (amountInput) amountInput.value = "";

      await this._services.centralizedRefreshService.forceRefresh();
      // Force a fresh render that will auto-select the correct direction
      this._render();

      // If connected, auto-populate balance for the new account
      if (account) {
        this._autoPopulateMaxBalance();
      }
    });
  }

  /**
   * Setup event listeners
   */
  private _setupEventListeners() {
    // Use requestAnimationFrame to ensure DOM is ready
    // eslint-disable-next-line func-style
    const setupListeners = () => {
      const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
      const depositButton = document.getElementById("depositButton") as HTMLButtonElement;
      const withdrawButton = document.getElementById("withdrawButton") as HTMLButtonElement;
      const ubqDiscountCheckbox = document.getElementById("useUbqDiscount") as HTMLInputElement;
      const swapOnlyCheckbox = document.getElementById("forceSwapOnly") as HTMLInputElement;
      const fractionalRedemptionCheckbox = document.getElementById("acceptFractionalRedemption") as HTMLInputElement;

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
        ubqDiscountCheckbox.addEventListener("change", async (e) => {
          // Double-check minting is allowed before accepting the change
          if (this._state.direction === "deposit" && this._state.mintingDisabled) {
            console.warn("[UBQ DISCOUNT] Minting disabled - preventing UBQ discount selection");
            e.preventDefault();
            (e.target as HTMLInputElement).checked = false;
            this._state.useUbqDiscount = false;

            // Hide the option immediately
            const ubqOptionDiv = document.getElementById("ubqDiscountOption");
            if (ubqOptionDiv) {
              ubqOptionDiv.style.display = "none";
            }
            return;
          }

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
    }, 150);
  }

  private _getSelectedToken() {
    const selectEl = document.getElementById("tokenSelect") as HTMLSelectElement;
    if (!selectEl) {
      throw new Error("Token select element not found");
    }
    const selectedOption = selectEl.selectedOptions[0];
    const address = selectedOption.value as Address;
    const decimalsAttr = selectedOption.getAttribute("data-decimals");
    const symbolAttr = selectedOption.getAttribute("data-symbol");
    const decimals = decimalsAttr ? parseInt(decimalsAttr, 10) : 18;
    const symbol = symbolAttr || "UNKNOWN";
    return {
      address,
      symbol,
      decimals,
    };
  }

  private _handleTokenSelect(_event: Event) {
    void this._render();
    void this._calculateRoute();
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

    this._initTokenSelectAndLabel(true);

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
      const selectedToken = this._getSelectedToken();
      const inputToken = this._state.direction === "deposit" ? selectedToken : INVENTORY_TOKENS.UUSD;
      const inputAmount = parseUnits(amount, inputToken.decimals);
      let routeResult: OptimalRouteResult;

      if (this._state.direction === "deposit") {
        if (!areAddressesEqual(selectedToken.address, LUSD_COLLATERAL.address)) {
          routeResult = await this._services.cowSwapService.getDepositRoute(selectedToken, inputAmount);
        } else {
          // For deposits, check if UBQ discount is available and user wants it
          const shouldForceCollateralOnly = !this._state.useUbqDiscount;
          routeResult = await this._optimalRouteService.getOptimalDepositRoute(inputAmount, shouldForceCollateralOnly);
        }
      } else {
        if (!areAddressesEqual(selectedToken.address, LUSD_COLLATERAL.address)) {
          routeResult = await this._services.cowSwapService.getWithdrawRoute(selectedToken, inputAmount);
        } else {
          // For withdrawals, ALWAYS use forceSwapOnly when redemptions are disabled
          const shouldForceSwap = this._state.redemptionsDisabled || this._state.forceSwapOnly;

          routeResult = await this._optimalRouteService.getOptimalWithdrawRoute(inputAmount, shouldForceSwap);
        }
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

    // Check if balances are still loading
    const isBalancesLoading = isConnected && !this._services.inventoryBar.isInitialLoadComplete();

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
        amountInput.placeholder = "Enter amount";
      }
    }

    // Show/hide options based on protocol state and direction
    this._renderTokenOptions();
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
      mintingDisabled: this._state.mintingDisabled,
      forceSwapOnly: this._state.forceSwapOnly,
      protocolIsFractional: this._state.protocolSettings?.isFractional,
    });

    const ubqOptionDiv = document.getElementById("ubqDiscountOption");
    const swapOnlyDiv = document.getElementById("swapOnlyOption");
    const swapOnlyCheckbox = document.getElementById("forceSwapOnly") as HTMLInputElement;
    const fractionalRedemptionDiv = document.getElementById("fractionalRedemptionOption");
    const fractionalRedemptionCheckbox = document.getElementById("acceptFractionalRedemption") as HTMLInputElement;

    if (!this._state.protocolSettings) {
      // Hide all options if settings not loaded
      if (ubqOptionDiv) ubqOptionDiv.style.display = "none";
      if (swapOnlyDiv) swapOnlyDiv.style.display = "none";
      if (fractionalRedemptionDiv) fractionalRedemptionDiv.style.display = "none";
      return;
    }

    if (this._state.direction === "deposit") {
      // For deposits: Show UBQ discount option only if protocol is fractional AND minting is allowed
      if (ubqOptionDiv) {
        // Only show UBQ option if fractional AND minting is allowed
        const shouldShowUbqOption =
          this._state.protocolSettings.isFractional &&
          !this._state.mintingDisabled &&
          areAddressesEqual(this._getSelectedToken().address, LUSD_COLLATERAL.address);

        console.log("[UBQ DISCOUNT] Visibility check:", {
          isFractional: this._state.protocolSettings.isFractional,
          mintingDisabled: this._state.mintingDisabled,
          shouldShow: shouldShowUbqOption,
          currentDisplay: ubqOptionDiv.style.display,
        });

        ubqOptionDiv.style.display = shouldShowUbqOption ? "block" : "none";

        // If minting not allowed, ensure the checkbox is unchecked
        if (this._state.mintingDisabled) {
          const ubqDiscountCheckbox = document.getElementById("useUbqDiscount") as HTMLInputElement;
          if (ubqDiscountCheckbox) {
            ubqDiscountCheckbox.checked = false;
          }
        }
      }

      // Hide swap-only and fractional redemption options for deposits
      if (swapOnlyDiv) swapOnlyDiv.style.display = "none";
      if (fractionalRedemptionDiv) fractionalRedemptionDiv.style.display = "none";
    } else {
      // WITHDRAWALS: Intelligent routing based on protocol economics
      const settings = this._state.protocolSettings;

      if (this._state.redemptionsDisabled) {
        // Case 1: Price too high OR protocol conditions don't allow redemption
        // Force Curve swap only, hide all choices to declutter UI

        this._state.forceSwapOnly = true;
        if (swapOnlyDiv) swapOnlyDiv.style.display = "none";
        if (fractionalRedemptionDiv) fractionalRedemptionDiv.style.display = "none";
        if (swapOnlyCheckbox) {
          swapOnlyCheckbox.checked = true;
          swapOnlyCheckbox.disabled = true;
        }
      } else if (settings.isFullyCollateralized) {
        // Case 2: Protocol 100%+ collateralized AND price below peg
        // Show swap vs redemption choice (both give pure LUSD)

        if (swapOnlyDiv && swapOnlyCheckbox) {
          swapOnlyDiv.style.display = "block";
          swapOnlyCheckbox.disabled = false;
          swapOnlyCheckbox.checked = this._state.forceSwapOnly;
        }
        if (fractionalRedemptionDiv) fractionalRedemptionDiv.style.display = "none";
      } else if (settings.isFractional) {
        // Case 3: Protocol fractionally collateralized (~65%) AND price below peg
        // Default to Curve swap (pure LUSD), allow opt-in to fractional redemption (LUSD+UBQ)

        this._state.forceSwapOnly = !this._state.acceptFractionalRedemption;
        if (swapOnlyDiv) swapOnlyDiv.style.display = "none"; // Hide the old swap checkbox

        if (fractionalRedemptionDiv && fractionalRedemptionCheckbox) {
          fractionalRedemptionDiv.style.display = "block";
          fractionalRedemptionCheckbox.checked = this._state.acceptFractionalRedemption;
        }
      }

      // Hide UBQ option for withdrawals
      if (ubqOptionDiv) ubqOptionDiv.style.display = "none";
    }

    console.log("[RENDER OPTIONS] Complete. DOM state:", {
      ubqDiscountDisplay: ubqOptionDiv?.style.display,
      swapOnlyDisplay: swapOnlyDiv?.style.display,
      fractionalRedemptionDisplay: fractionalRedemptionDiv?.style.display,
      forceSwapOnly: this._state.forceSwapOnly,
      acceptFractionalRedemption: this._state.acceptFractionalRedemption,
      useUbqDiscount: this._state.useUbqDiscount,
      mintingDisabled: this._state.mintingDisabled,
      swapOnlyCheckboxChecked: swapOnlyCheckbox?.checked,
      fractionalRedemptionCheckboxChecked: fractionalRedemptionCheckbox?.checked,
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
      let outputText = formatUnits(this._state.routeResult.expectedOutput, this._state.routeResult.outputToken.decimals);

      // Add UBQ if it's part of the transaction
      const ubqOutputEl = document.getElementById("ubqOutput");
      if (this._state.direction === "withdraw" && this._state.routeResult.isUbqOperation && this._state.routeResult.ubqAmount) {
        if (ubqOutputEl) {
          ubqOutputEl.textContent = ` + ${formatEther(this._state.routeResult.ubqAmount)} UBQ`;
        }
      } else {
        if (ubqOutputEl) {
          ubqOutputEl.textContent = "";
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
      } else if (this._state.routeResult.routeType === "cowswap") {
        const fromToken = this._state.direction === "deposit" ? this._getSelectedToken().address : INVENTORY_TOKENS.UUSD.address;
        const allowance = await this._services.cowSwapService.getCowSwapSdk().getCowProtocolAllowance({
          tokenAddress: fromToken,
          owner: account,
        });
        hasNeedsApproval = allowance < this._state.routeResult.inputAmount;
        approvalToken = this._state.direction === "deposit" ? this._state.routeResult.inputToken.symbol : INVENTORY_TOKENS.UUSD.symbol;
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
            minAmountOut: (result.expectedOutput * (BASIS_POINTS_DIVISOR - DEFAULT_SLIPPAGE_BPS)) / BASIS_POINTS_DIVISOR,
            slippageTolerance: DEFAULT_SLIPPAGE_PERCENT,
          });
          break;

        case "cowswap":
          await this._services.cowSwapService.executeTransaction(result);
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

    // Immediately refresh balances after successful transaction
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

  private _autoPopulateRetryTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Auto-populate with max balance
   */
  private _autoPopulateMaxBalance(retryCount: number = 0) {
    // Cancel any pending retries when called
    if (this._autoPopulateRetryTimeout) {
      clearTimeout(this._autoPopulateRetryTimeout);
      this._autoPopulateRetryTimeout = null;
    }

    if (!this._services.walletService.isConnected()) return;

    const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
    if (!amountInput) {
      // Retry if DOM element not ready (max 3 retries)
      if (retryCount < 3) {
        this._autoPopulateRetryTimeout = setTimeout(() => this._autoPopulateMaxBalance(retryCount + 1), 50);
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
        this._autoPopulateRetryTimeout = setTimeout(() => this._autoPopulateMaxBalance(retryCount + 1), 100);
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
