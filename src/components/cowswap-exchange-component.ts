import { type Address, formatUnits, parseUnits } from "viem";
import type { WalletService } from "../services/wallet-service.ts";
import type { ContractService } from "../services/contract-service.ts";
import { CowSwapService, COMMON_TOKENS, type CowSwapQuoteResponse, type CowSwapOrderStatus, type TokenInfo } from "../services/cowswap-service.ts";
import type { NotificationManager } from "./notification-manager.ts";
import { TransactionStateService } from "../services/transaction-state-service.ts";
import type { InventoryBarComponent } from "./inventory-bar-component.ts";
import { WALLET_EVENTS } from "../services/wallet-service.ts";
import { ADDRESSES } from "../contracts/constants.ts";

/**
 * CowSwap exchange flow steps
 */
type CowSwapFlowStep = "idle" | "quoting" | "approving" | "signing" | "submitted" | "filling" | "complete" | "error";

/**
 * CowSwap exchange direction
 */
type CowSwapDirection = "deposit" | "withdraw";

/**
 * State for the CowSwap exchange component
 */
interface CowSwapExchangeState {
  direction: CowSwapDirection;
  selectedToken: TokenInfo | null;
  amount: string;
  quote: CowSwapQuoteResponse | null;
  orderUid: string | null;
  orderStatus: CowSwapOrderStatus | null;
  flowStep: CowSwapFlowStep;
  errorMessage: string | null;
  isVisible: boolean;
}

interface CowSwapExchangeServices {
  walletService: WalletService;
  contractService: ContractService;
  notificationManager: NotificationManager;
  inventoryBar: InventoryBarComponent;
}

/**
 * CowSwap Exchange Component
 * Handles deposit-anything and withdraw-anything flows via CowSwap protocol
 */
export class CowSwapExchangeComponent {
  private _services: CowSwapExchangeServices;
  private _cowSwapService: CowSwapService;
  private _transactionStateService: TransactionStateService;
  private _debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _pollTimer: ReturnType<typeof setTimeout> | null = null;

  private _state: CowSwapExchangeState = {
    direction: "deposit",
    selectedToken: null,
    amount: "",
    quote: null,
    orderUid: null,
    orderStatus: null,
    flowStep: "idle",
    errorMessage: null,
    isVisible: false,
  };

  constructor(services: CowSwapExchangeServices) {
    this._services = services;
    this._cowSwapService = new CowSwapService(services.walletService, services.contractService);
    this._transactionStateService = TransactionStateService.getInstance();

    this._init();
  }

  private _init() {
    this._setupEventListeners();
    this._setupWalletListeners();
  }

  /**
   * Show/hide the CowSwap exchange panel
   */
  setVisible(visible: boolean) {
    this._state.isVisible = visible;
    const container = document.getElementById("cowswapExchangeContainer");
    if (container) {
      container.style.display = visible ? "block" : "none";
    }
  }

  /**
   * Set the exchange direction (deposit = buy UUSD, withdraw = sell UUSD)
   */
  setDirection(direction: CowSwapDirection) {
    this._state.direction = direction;
    this._state.quote = null;
    this._state.amount = "";
    this._state.flowStep = "idle";
    this._state.errorMessage = null;

    // Set default token based on direction
    if (direction === "deposit") {
      // Default to USDC for deposits
      this._state.selectedToken = COMMON_TOKENS.find((t) => t.symbol === "USDC") || null;
    } else {
      // Default to USDC for withdrawals
      this._state.selectedToken = COMMON_TOKENS.find((t) => t.symbol === "USDC") || null;
    }

    this._render();
  }

  /**
   * Set up DOM event listeners
   */
  private _setupEventListeners() {
    requestAnimationFrame(() => {
      this._attachListeners();
    });
  }

  private _attachListeners() {
    const tokenSelect = document.getElementById("cowswapTokenSelect") as HTMLSelectElement;
    const amountInput = document.getElementById("cowswapAmount") as HTMLInputElement;
    const executeButton = document.getElementById("cowswapExecuteButton") as HTMLButtonElement;

    if (!tokenSelect || !amountInput || !executeButton) {
      // DOM not ready yet, retry
      requestAnimationFrame(() => this._attachListeners());
      return;
    }

    tokenSelect.addEventListener("change", (e) => {
      const address = (e.target as HTMLSelectElement).value as Address;
      this._state.selectedToken = COMMON_TOKENS.find((t) => t.address.toLowerCase() === address.toLowerCase()) || null;
      this._state.quote = null;
      this._state.flowStep = "idle";
      this._handleAmountChange();
    });

    amountInput.addEventListener("input", () => {
      this._handleAmountChange();
    });

    executeButton.addEventListener("click", () => {
      void this._executeFlow();
    });
  }

  /**
   * Set up wallet event listeners
   */
  private _setupWalletListeners() {
    this._services.walletService.addEventListener(WALLET_EVENTS.CONNECT, () => {
      this._render();
    });

    this._services.walletService.addEventListener(WALLET_EVENTS.DISCONNECT, () => {
      this._resetState();
      this._render();
    });

    this._services.walletService.addEventListener(WALLET_EVENTS.ACCOUNT_CHANGED, () => {
      this._resetState();
      this._render();
    });
  }

  /**
   * Handle amount input changes with debounce
   */
  private _handleAmountChange() {
    const amountInput = document.getElementById("cowswapAmount") as HTMLInputElement;
    this._state.amount = amountInput?.value || "";
    this._state.quote = null;

    if (this._debounceTimer) {
      clearTimeout(this._debounceTimer);
    }

    if (!this._state.amount || !this._state.selectedToken) {
      this._state.flowStep = "idle";
      this._renderOutput();
      return;
    }

    this._state.flowStep = "quoting";
    this._renderOutput();

    this._debounceTimer = setTimeout(() => {
      void this._fetchQuote();
    }, 500);
  }

  /**
   * Fetch a quote from CowSwap
   */
  private async _fetchQuote() {
    if (!this._state.selectedToken || !this._state.amount) {
      return;
    }

    try {
      this._state.flowStep = "quoting";
      this._renderOutput();

      let sellToken: Address;
      let buyToken: Address;
      let sellAmount: string;

      if (this._state.direction === "deposit") {
        // Deposit: sell selected token, buy UUSD
        sellToken = this._state.selectedToken.address;
        buyToken = ADDRESSES.DOLLAR;
        sellAmount = parseUnits(this._state.amount, this._state.selectedToken.decimals).toString();
      } else {
        // Withdraw: sell UUSD, buy selected token
        sellToken = ADDRESSES.DOLLAR;
        buyToken = this._state.selectedToken.address;
        sellAmount = parseUnits(this._state.amount, 18).toString(); // UUSD is 18 decimals
      }

      const quote = await this._cowSwapService.getCachedQuote(sellToken, buyToken, sellAmount, "sell");

      this._state.quote = quote;
      this._state.flowStep = "idle";
      this._state.errorMessage = null;
      this._renderOutput();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to get quote";
      this._state.errorMessage = message;
      this._state.flowStep = "error";
      this._state.quote = null;
      this._renderOutput();
    }
  }

  /**
   * Execute the full CowSwap flow: approve -> sign -> submit -> poll
   */
  private async _executeFlow() {
    if (!this._state.quote || !this._state.selectedToken) {
      return;
    }

    const account = this._services.walletService.getAccount();
    if (!account) {
      this._services.notificationManager.showError("cowswap", "Please connect wallet first");
      return;
    }

    this._transactionStateService.startTransaction("cowswapExecuteButton");

    try {
      // Step 1: Ensure token approval for CowSwap vault relayer
      this._state.flowStep = "approving";
      this._renderOutput();

      const sellToken = this._state.direction === "deposit" ? this._state.selectedToken.address : ADDRESSES.DOLLAR;
      const sellAmount = BigInt(this._state.quote.quote.sellAmount) + BigInt(this._state.quote.quote.feeAmount);

      const approvalHash = await this._cowSwapService.ensureAllowance(sellToken, sellAmount);
      if (approvalHash) {
        this._updateStepNotice("Token approved. Signing order...");
      }

      // Step 2: Sign and submit the order
      this._state.flowStep = "signing";
      this._renderOutput();

      const orderUid = await this._cowSwapService.submitOrder(this._state.quote);
      this._state.orderUid = orderUid;

      // Step 3: Poll for order completion
      this._state.flowStep = "submitted";
      this._renderOutput();

      this._state.flowStep = "filling";
      this._renderOutput();

      const finalStatus = await this._cowSwapService.waitForOrderCompletion(orderUid);
      this._state.orderStatus = finalStatus;

      // Step 4: Success
      this._state.flowStep = "complete";
      this._renderOutput();

      const directionLabel = this._state.direction === "deposit" ? "bought UUSD" : "sold UUSD";
      this._transactionStateService.completeTransaction("cowswapExecuteButton", `Done!`);
      this._services.notificationManager.showSuccess("cowswap", `Successfully ${directionLabel} via CowSwap`);

      // Refresh balances
      void this._services.inventoryBar.refreshBalances();

      // Reset after showing success briefly
      setTimeout(() => {
        this._resetState();
        this._render();
      }, 3000);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Transaction failed";

      // Handle user rejection gracefully
      if (message.includes("rejected") || message.includes("denied") || message.includes("User rejected")) {
        this._state.flowStep = "idle";
        this._state.errorMessage = null;
        this._transactionStateService.errorTransaction("cowswapExecuteButton", "Cancelled", "Try Again");
      } else {
        this._state.flowStep = "error";
        this._state.errorMessage = message;
        this._transactionStateService.errorTransaction("cowswapExecuteButton", message, "Try Again");
        this._services.notificationManager.showError("cowswap", message);
      }

      this._renderOutput();
    }
  }

  /**
   * Reset component state
   */
  private _resetState() {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }

    this._state.amount = "";
    this._state.quote = null;
    this._state.orderUid = null;
    this._state.orderStatus = null;
    this._state.flowStep = "idle";
    this._state.errorMessage = null;

    const amountInput = document.getElementById("cowswapAmount") as HTMLInputElement;
    if (amountInput) {
      amountInput.value = "";
    }
  }

  /**
   * Render the component
   */
  private _render() {
    const container = document.getElementById("cowswapExchangeContainer");
    if (!container) return;

    const isConnected = !!this._services.walletService.getAccount();

    if (!isConnected || !this._state.isVisible) {
      container.style.display = "none";
      return;
    }

    container.style.display = "block";
    this._renderTokenSelect();
    this._renderAmountInput();
    this._renderOutput();
  }

  /**
   * Render the token selector dropdown
   */
  private _renderTokenSelect() {
    const tokenSelect = document.getElementById("cowswapTokenSelect") as HTMLSelectElement;
    if (!tokenSelect) return;

    // Filter out UUSD for deposits and LUSD for both (handled by existing flow)
    const availableTokens = COMMON_TOKENS.filter((t) => {
      if (this._state.direction === "deposit") {
        // For deposits, exclude UUSD (that's what we're buying) and LUSD (existing flow handles it)
        return !this._cowSwapService.isUUSD(t.address) && !this._cowSwapService.isLUSD(t.address);
      } else {
        // For withdrawals, exclude UUSD (that's what we're selling) and LUSD (existing flow handles it)
        return !this._cowSwapService.isUUSD(t.address) && !this._cowSwapService.isLUSD(t.address);
      }
    });

    tokenSelect.innerHTML = '<option value="">Select token</option>';

    availableTokens.forEach((token) => {
      const option = document.createElement("option");
      option.value = token.address;
      option.textContent = `${token.symbol} - ${token.name}`;

      if (this._state.selectedToken?.address.toLowerCase() === token.address.toLowerCase()) {
        option.selected = true;
      }

      tokenSelect.appendChild(option);
    });
  }

  /**
   * Render amount input state
   */
  private _renderAmountInput() {
    const amountInput = document.getElementById("cowswapAmount") as HTMLInputElement;
    const tokenLabel = document.getElementById("cowswapTokenLabel");

    if (amountInput) {
      const isLocked = ["approving", "signing", "submitted", "filling"].includes(this._state.flowStep);
      amountInput.disabled = isLocked;

      if (this._state.direction === "deposit") {
        amountInput.placeholder = this._state.selectedToken ? `Enter ${this._state.selectedToken.symbol} amount` : "Select a token first";
      } else {
        amountInput.placeholder = "Enter UUSD amount";
      }
    }

    if (tokenLabel) {
      if (this._state.direction === "deposit") {
        tokenLabel.textContent = this._state.selectedToken?.symbol || "Token";
      } else {
        tokenLabel.textContent = "UUSD";
      }
    }
  }

  /**
   * Render the output section (quote preview, status, buttons)
   */
  private _renderOutput() {
    const outputSection = document.getElementById("cowswapOutput");
    const executeButton = document.getElementById("cowswapExecuteButton") as HTMLButtonElement;
    const quoteDisplay = document.getElementById("cowswapQuoteDisplay");
    const stepNotice = document.getElementById("cowswapStepNotice");
    const errorDisplay = document.getElementById("cowswapError");
    const explorerLink = document.getElementById("cowswapExplorerLink") as HTMLAnchorElement;

    if (!outputSection || !executeButton) return;

    // Reset displays
    if (quoteDisplay) quoteDisplay.style.display = "none";
    if (stepNotice) stepNotice.style.display = "none";
    if (errorDisplay) errorDisplay.style.display = "none";
    if (explorerLink) explorerLink.style.display = "none";

    switch (this._state.flowStep) {
      case "idle":
        if (this._state.quote) {
          this._renderQuotePreview();
          outputSection.style.display = "block";
          executeButton.textContent = this._state.direction === "deposit" ? "Swap & Buy UUSD" : "Sell UUSD & Swap";
          executeButton.disabled = false;
        } else if (this._state.amount && this._state.selectedToken) {
          outputSection.style.display = "block";
          executeButton.textContent = "Enter amount";
          executeButton.disabled = true;
        } else {
          outputSection.style.display = "none";
        }
        break;

      case "quoting":
        outputSection.style.display = "block";
        executeButton.textContent = "Fetching quote...";
        executeButton.disabled = true;
        this._updateStepNotice("Getting best price from CowSwap...");
        break;

      case "approving":
        outputSection.style.display = "block";
        executeButton.textContent = "Approving token...";
        executeButton.disabled = true;
        this._updateStepNotice("Please approve token spending in your wallet.");
        break;

      case "signing":
        outputSection.style.display = "block";
        executeButton.textContent = "Sign order...";
        executeButton.disabled = true;
        this._updateStepNotice("Please sign the CowSwap order in your wallet.");
        break;

      case "submitted":
        outputSection.style.display = "block";
        executeButton.textContent = "Order submitted";
        executeButton.disabled = true;
        this._updateStepNotice("Order submitted to CowSwap. Waiting for a solver to match your order...");
        this._renderExplorerLink();
        break;

      case "filling":
        outputSection.style.display = "block";
        executeButton.textContent = "Filling order...";
        executeButton.disabled = true;
        this._updateStepNotice("A solver is filling your order. This usually takes 30 seconds to a few minutes.");
        this._renderExplorerLink();
        break;

      case "complete":
        outputSection.style.display = "block";
        executeButton.textContent = "Complete!";
        executeButton.disabled = true;
        this._updateStepNotice("Order filled successfully!");
        this._renderExplorerLink();
        break;

      case "error":
        outputSection.style.display = "block";
        executeButton.textContent = "Try Again";
        executeButton.disabled = false;
        if (errorDisplay && this._state.errorMessage) {
          errorDisplay.textContent = this._state.errorMessage;
          errorDisplay.style.display = "block";
        }
        break;
    }
  }

  /**
   * Render the quote preview
   */
  private _renderQuotePreview() {
    const quoteDisplay = document.getElementById("cowswapQuoteDisplay");
    if (!quoteDisplay || !this._state.quote || !this._state.selectedToken) return;

    const quote = this._state.quote.quote;
    let receiveToken: TokenInfo;
    let receiveAmount: string;

    if (this._state.direction === "deposit") {
      // Buying UUSD: receive UUSD
      receiveToken = { address: ADDRESSES.DOLLAR, symbol: "UUSD", name: "Ubiquity Dollar", decimals: 18 };
      receiveAmount = formatUnits(BigInt(quote.buyAmount), 18);
    } else {
      // Selling UUSD: receive selected token
      receiveToken = this._state.selectedToken;
      receiveAmount = formatUnits(BigInt(quote.buyAmount), this._state.selectedToken.decimals);
    }

    const feeAmount = formatUnits(BigInt(quote.feeAmount), this._state.direction === "deposit" ? this._state.selectedToken.decimals : 18);
    const feeToken = this._state.direction === "deposit" ? this._state.selectedToken.symbol : "UUSD";

    quoteDisplay.innerHTML = `
      <div class="output-row main-output">
        <span class="output-label">You will receive:</span>
        <span class="output-value">${this._formatDisplayAmount(receiveAmount)} ${receiveToken.symbol}</span>
      </div>
      <div class="output-row" style="font-size: 12px; color: rgba(255,255,255,0.6);">
        <span>Network fee (paid in ${feeToken}):</span>
        <span>${this._formatDisplayAmount(feeAmount)} ${feeToken}</span>
      </div>
    `;
    quoteDisplay.style.display = "block";
  }

  /**
   * Update the step notice text
   */
  private _updateStepNotice(text: string) {
    const stepNotice = document.getElementById("cowswapStepNotice");
    if (stepNotice) {
      stepNotice.textContent = text;
      stepNotice.style.display = "block";
    }
  }

  /**
   * Render the CowSwap explorer link
   */
  private _renderExplorerLink() {
    const explorerLink = document.getElementById("cowswapExplorerLink") as HTMLAnchorElement;
    if (explorerLink && this._state.orderUid) {
      explorerLink.href = this._cowSwapService.getExplorerUrl(this._state.orderUid);
      explorerLink.textContent = "View on CowSwap Explorer";
      explorerLink.style.display = "inline-block";
    }
  }

  /**
   * Format a numeric string for display (max 6 decimal places)
   */
  private _formatDisplayAmount(amount: string): string {
    const num = parseFloat(amount);
    if (isNaN(num)) return "0";
    if (num === 0) return "0";

    // Use at most 6 decimal places
    if (num < 0.000001) return "<0.000001";
    return num.toLocaleString("en-US", { maximumFractionDigits: 6 });
  }

  /**
   * Get the CowSwap service instance (for external use)
   */
  getCowSwapService(): CowSwapService {
    return this._cowSwapService;
  }
}
