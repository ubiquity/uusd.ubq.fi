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
  originalClickHandler?: ((this: GlobalEventHandlers, ev: MouseEvent) => any) | null;
}

export class TransactionStateService {
  private static instance: TransactionStateService;
  private transactions = new Map<string, TransactionState>();

  static getInstance(): TransactionStateService {
    if (!TransactionStateService.instance) {
      TransactionStateService.instance = new TransactionStateService();
    }
    return TransactionStateService.instance;
  }

  /**
   * Register a button for transaction state management
   */
  registerButton(buttonId: string, config: TransactionStateConfig): void {
    const button = config.buttonElement;

    // Store original click handler
    const originalClickHandler = button.onclick;

    const transactionState: TransactionState = {
      isLoading: false,
      buttonElement: button,
      config,
      originalClickHandler
    };

    this.transactions.set(buttonId, transactionState);

    // Set up new click handler that manages state
    button.onclick = (event) => {
      const state = this.transactions.get(buttonId);
      if (!state) return;

      if (state.isLoading && state.hash) {
        // Button is pending - show transaction instead of executing new one
        this.showTransactionDetails(state.hash);
        event.preventDefault();
        return;
      }

      if (state.isLoading) {
        // Transaction is already in progress, don't allow new clicks
        event.preventDefault();
        return;
      }

      // Execute original functionality - let components handle startTransaction via events
      if (state.originalClickHandler) {
        state.originalClickHandler.call(button, event);
      } else if (config.onTransactionClick) {
        config.onTransactionClick();
      }
    };

    console.log(`✅ Registered transaction button: ${buttonId}`);
  }

  /**
   * Start a transaction for a button - shows immediate loading state
   */
  startTransaction(buttonId: string, pendingText?: string): void {
    const state = this.transactions.get(buttonId);
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
    button.classList.add('transaction-pending');

    // Don't disable the button - keep it clickable but change behavior
    button.disabled = false;

    console.log(`🔄 Started transaction for button: ${buttonId}`);
  }

  /**
   * Handle approval needed - shows specific approval loading state
   */
  startApproval(buttonId: string, tokenSymbol: string): void {
    const state = this.transactions.get(buttonId);
    if (!state) {
      console.warn(`⚠️ Transaction button not found: ${buttonId}`);
      return;
    }

    state.isLoading = true;
    state.error = undefined;
    state.hash = undefined;

    const button = state.buttonElement;
    button.innerHTML = `Approving ${tokenSymbol}...<span class="loading"></span>`;
    button.classList.add('transaction-pending');
    button.disabled = false;

    console.log(`🔄 Started approval for button: ${buttonId} - ${tokenSymbol}`);
  }

  /**
   * Handle approval complete - continue with transaction
   */
  completeApproval(buttonId: string): void {
    const state = this.transactions.get(buttonId);
    if (!state) return;

    // Keep the loading state, just update text to show main transaction is proceeding
    const button = state.buttonElement;
    button.innerHTML = `Processing...<span class="loading"></span>`;

    console.log(`✅ Completed approval for button: ${buttonId}`);
  }

  /**
   * Update transaction hash - shows clickable link to view transaction
   */
  updateTransactionHash(buttonId: string, hash: string): void {
    const state = this.transactions.get(buttonId);
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
    button.classList.add('transaction-pending');
    button.disabled = false;
    button.title = `Click to view transaction: ${hash}`;

    console.log(`🔗 Updated transaction hash for button: ${buttonId} - ${hash}`);
  }

  /**
   * Complete a transaction successfully
   */
  completeTransaction(buttonId: string, successText?: string): void {
    const state = this.transactions.get(buttonId);
    if (!state) {
      console.warn(`⚠️ Transaction button not found: ${buttonId}`);
      return;
    }

    state.isLoading = false;
    state.error = undefined;
    state.hash = undefined;

    const button = state.buttonElement;
    button.innerHTML = state.config.originalText;
    button.classList.remove('transaction-pending', 'transaction-error');
    button.disabled = false;
    button.title = '';

    if (successText) {
      // Temporarily show success text
      button.innerHTML = successText;
      setTimeout(() => {
        if (!state.isLoading) { // Only reset if no new transaction started
          button.innerHTML = state.config.originalText;
        }
      }, 2000);
    }

    console.log(`✅ Completed transaction for button: ${buttonId}`);
  }

  /**
   * Handle transaction error
   */
  errorTransaction(buttonId: string, error: string, errorText?: string): void {
    const state = this.transactions.get(buttonId);
    if (!state) {
      console.warn(`⚠️ Transaction button not found: ${buttonId}`);
      return;
    }

    state.isLoading = false;
    state.error = error;
    state.hash = undefined;

    const button = state.buttonElement;
    button.innerHTML = errorText || state.config.originalText;
    button.classList.remove('transaction-pending');
    button.classList.add('transaction-error');
    button.disabled = false;
    button.title = `Error: ${error}`;

    // Reset error state after a delay
    setTimeout(() => {
      if (!state.isLoading) { // Only reset if no new transaction started
        button.classList.remove('transaction-error');
        button.innerHTML = state.config.originalText;
        button.title = '';
      }
    }, 3000);

    console.log(`❌ Transaction error for button: ${buttonId} - ${error}`);
  }

  /**
   * Update button text (e.g., for approval state changes)
   */
  updateButtonText(buttonId: string, newText: string): void {
    const state = this.transactions.get(buttonId);
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
    return this.transactions.get(buttonId);
  }

  /**
   * Check if any transaction is in progress
   */
  hasActiveTransaction(): boolean {
    return Array.from(this.transactions.values()).some(state => state.isLoading);
  }

  /**
   * Get all active transactions
   */
  getActiveTransactions(): { buttonId: string; hash?: string }[] {
    const active: { buttonId: string; hash?: string }[] = [];

    for (const [buttonId, state] of this.transactions.entries()) {
      if (state.isLoading) {
        active.push({ buttonId, hash: state.hash });
      }
    }

    return active;
  }

  /**
   * Show transaction details (open in explorer)
   */
  private showTransactionDetails(hash: string): void {
    // For Ethereum mainnet - adjust for other networks as needed
    const explorerUrl = `https://etherscan.io/tx/${hash}`;
    window.open(explorerUrl, '_blank', 'noopener,noreferrer');

    console.log(`🔗 Opened transaction in explorer: ${hash}`);
  }

  /**
   * Unregister a button (cleanup)
   */
  unregisterButton(buttonId: string): void {
    const state = this.transactions.get(buttonId);
    if (state && state.originalClickHandler) {
      // Restore original click handler
      state.buttonElement.onclick = state.originalClickHandler;
    }

    this.transactions.delete(buttonId);
    console.log(`🗑️ Unregistered transaction button: ${buttonId}`);
  }

  /**
   * Reset all buttons to initial state (useful for wallet disconnect)
   */
  resetAllButtons(): void {
    for (const [buttonId, state] of this.transactions.entries()) {
      if (state.isLoading) {
        state.isLoading = false;
        state.hash = undefined;
        state.error = undefined;

        const button = state.buttonElement;
        button.innerHTML = state.config.originalText;
        button.classList.remove('transaction-pending', 'transaction-error');
        button.disabled = false;
        button.title = '';
      }
    }

    console.log(`🔄 Reset all transaction buttons`);
  }
}
