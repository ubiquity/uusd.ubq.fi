export interface TransactionStateConfig {
  buttonElement: HTMLButtonElement;
  originalText: string;
  pendingText: string;
  onTransactionClick?: () => void;
}

export interface TransactionState {
  hash?: string;
  isLoading: boolean;
  error?: string;
  buttonElement: HTMLButtonElement;
  config: TransactionStateConfig;
  originalClickHandler?: ((this: GlobalEventHandlers, ev: MouseEvent) => void) | null;
}

export class TransactionStateService {
  private static _instance: TransactionStateService;
  private _transactions = new Map<string, TransactionState>();

  static getInstance(): TransactionStateService {
    if (!TransactionStateService._instance) {
      TransactionStateService._instance = new TransactionStateService();
    }
    return TransactionStateService._instance;
  }

  /**
   * Register a button for transaction state management
   */
  registerButton(buttonId: string, config: TransactionStateConfig): void {
    const button = config.buttonElement;

    // Check if button is already registered
    if (this._transactions.has(buttonId)) {
      // Already registered, just update config if needed
      const existingState = this._transactions.get(buttonId);
      if (!existingState) {
        throw new Error(`Transaction state not found for button: ${buttonId}`);
      }
      existingState.config = config;
      return;
    }

    // Store original click handler (only on first registration)
    const originalClickHandler = button.onclick;

    const transactionState: TransactionState = {
      isLoading: false,
      buttonElement: button,
      config,
      originalClickHandler,
    };

    this._transactions.set(buttonId, transactionState);

    // Set up new click handler that manages state
    button.onclick = (event) => {
      const state = this._transactions.get(buttonId);
      if (!state) return;

      if (state.isLoading && state.hash) {
        // Button is pending - show transaction instead of executing new one
        this._showTransactionDetails(state.hash);
        event.preventDefault();
        return;
      }

      if (state.isLoading) {
        // Transaction is already in progress, don't allow new clicks
        event.preventDefault();
        return;
      }

      // Execute transaction click handler
      if (config.onTransactionClick) {
        config.onTransactionClick();
      } else if (state.originalClickHandler) {
        // Only call original if it's not our own wrapper
        state.originalClickHandler.call(button, event);
      }
    };
  }

  /**
   * Start a transaction for a button - shows immediate loading state
   */
  startTransaction(buttonId: string, pendingText?: string): void {
    const state = this._transactions.get(buttonId);
    if (!state) {
      console.warn(`⚠️ Transaction button not found: ${buttonId}`);
      return;
    }

    state.isLoading = true;
    state.error = undefined;
    state.hash = undefined;

    const button = state.buttonElement;
    const displayText = pendingText || state.config.pendingText;

    button.innerHTML = `${displayText}<span class="loading"></span>`;
    button.classList.add("transaction-pending");

    // Don't disable the button - keep it clickable but change behavior
    button.disabled = false;
  }

  /**
   * Handle approval needed - shows specific approval loading state
   */
  startApproval(buttonId: string, tokenSymbol: string): void {
    const state = this._transactions.get(buttonId);
    if (!state) {
      console.warn(`⚠️ Transaction button not found: ${buttonId}`);
      return;
    }

    state.isLoading = true;
    state.error = undefined;
    state.hash = undefined;

    const button = state.buttonElement;
    button.innerHTML = `Approving ${tokenSymbol}...<span class="loading"></span>`;
    button.classList.add("transaction-pending");
    button.disabled = false;
  }

  /**
   * Handle approval complete - continue with transaction
   */
  completeApproval(buttonId: string): void {
    const state = this._transactions.get(buttonId);
    if (!state) return;

    // Keep the loading state, just update text to show main transaction is proceeding
    const button = state.buttonElement;
    button.innerHTML = `Processing...<span class="loading"></span>`;
  }

  /**
   * Update transaction hash - shows clickable link to view transaction
   */
  updateTransactionHash(buttonId: string, hash: string): void {
    const state = this._transactions.get(buttonId);
    if (!state) {
      console.warn(`⚠️ Transaction button not found: ${buttonId}`);
      return;
    }

    state.hash = hash;
    state.isLoading = true; // Still loading until completion

    const button = state.buttonElement;
    button.innerHTML = `
      <span style="color: inherit; text-decoration: none;">
        📋 View Transaction
      </span>
    `;
    button.classList.add("transaction-pending");
    button.disabled = false;
    button.title = `Click to view transaction: ${hash}`;
  }

  /**
   * Complete a transaction successfully
   */
  completeTransaction(buttonId: string, successText?: string): void {
    const state = this._transactions.get(buttonId);
    if (!state) {
      console.warn(`⚠️ Transaction button not found: ${buttonId}`);
      return;
    }

    state.isLoading = false;
    state.error = undefined;
    state.hash = undefined;

    const button = state.buttonElement;
    button.innerHTML = state.config.originalText;
    button.classList.remove("transaction-pending", "transaction-error");
    button.disabled = false;
    button.title = "";

    if (successText) {
      // Temporarily show success text
      button.innerHTML = successText;
      setTimeout(() => {
        if (!state.isLoading) {
          // Only reset if no new transaction started
          button.innerHTML = state.config.originalText;
        }
      }, 2000);
    }
  }

  /**
   * Handle transaction error
   */
  errorTransaction(buttonId: string, error: string, errorText?: string): void {
    const state = this._transactions.get(buttonId);
    if (!state) {
      console.warn(`⚠️ Transaction button not found: ${buttonId}`);
      return;
    }

    state.isLoading = false;
    state.error = error;
    state.hash = undefined;

    const button = state.buttonElement;
    button.innerHTML = errorText || state.config.originalText;
    button.classList.remove("transaction-pending");
    button.classList.add("transaction-error");
    button.disabled = false;
    button.title = `Error: ${error}`;

    // Reset error state after a delay
    setTimeout(() => {
      if (!state.isLoading) {
        // Only reset if no new transaction started
        button.classList.remove("transaction-error");
        button.innerHTML = state.config.originalText;
        button.title = "";
      }
    }, 3000);
  }

  /**
   * Update button text (e.g., for approval state changes)
   */
  updateButtonText(buttonId: string, newText: string): void {
    const state = this._transactions.get(buttonId);
    if (!state || state.isLoading) {
      return; // Don't update if transaction is in progress
    }

    state.config.originalText = newText;
    state.buttonElement.innerHTML = newText;
  }

  /**
   * Get current state of a button
   */
  getButtonState(buttonId: string): TransactionState | undefined {
    return this._transactions.get(buttonId);
  }

  /**
   * Check if any transaction is in progress
   */
  hasActiveTransaction(): boolean {
    return Array.from(this._transactions.values()).some((state) => state.isLoading);
  }

  /**
   * Get all active transactions
   */
  getActiveTransactions(): { buttonId: string; hash?: string }[] {
    const active: { buttonId: string; hash?: string }[] = [];

    for (const [buttonId, state] of this._transactions.entries()) {
      if (state.isLoading) {
        active.push({ buttonId, hash: state.hash });
      }
    }

    return active;
  }

  /**
   * Show transaction details (open in explorer)
   */
  private _showTransactionDetails(hash: string): void {
    // For Ethereum mainnet - adjust for other networks as needed
    const explorerUrl = `https://etherscan.io/tx/${hash}`;
    window.open(explorerUrl, "_blank", "noopener,noreferrer");
  }

  /**
   * Unregister a button (cleanup)
   */
  unregisterButton(buttonId: string): void {
    const state = this._transactions.get(buttonId);
    if (state && state.originalClickHandler) {
      // Restore original click handler
      state.buttonElement.onclick = state.originalClickHandler;
    }

    this._transactions.delete(buttonId);
  }

  /**
   * Reset all buttons to initial state (useful for wallet disconnect)
   */
  resetAllButtons(): void {
    for (const [, state] of this._transactions.entries()) {
      if (state.isLoading) {
        state.isLoading = false;
        state.hash = undefined;
        state.error = undefined;

        const button = state.buttonElement;
        button.innerHTML = state.config.originalText;
        button.classList.remove("transaction-pending", "transaction-error");
        button.disabled = false;
        button.title = "";
      }
    }
  }
}
