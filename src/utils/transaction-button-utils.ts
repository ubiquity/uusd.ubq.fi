import { TransactionStateService } from "../services/transaction-state-service.ts";

export interface TransactionButtonConfig {
  buttonId: string;
  originalText: string;
  pendingText: string;
  onTransactionClick: () => void | Promise<void>;
}

/**
 * Utility to ensure consistent transaction button UX across the app
 * Provides standardized registration and management of transaction buttons
 */
export class TransactionButtonUtils {
  private static transactionStateService = TransactionStateService.getInstance();

  /**
   * Register a transaction button with consistent UX
   */
  static registerTransactionButton(config: TransactionButtonConfig): void {
    // Wait for DOM to be ready
    setTimeout(() => {
      const button = document.getElementById(config.buttonId) as HTMLButtonElement;
      if (button) {
        this.transactionStateService.registerButton(config.buttonId, {
          buttonElement: button,
          originalText: config.originalText,
          pendingText: config.pendingText,
          onTransactionClick: config.onTransactionClick,
        });
      } else {
        console.warn(`⚠️ Transaction button not found: ${config.buttonId}`);
      }
    }, 100);
  }

  /**
   * Standard transaction flow handlers for consistent UX
   */
  static createTransactionHandlers(buttonId: string) {
    return {
      handleTransactionStart: () => {
        this.transactionStateService.startTransaction(buttonId);
      },

      handleTransactionSubmitted: (hash: string) => {
        this.transactionStateService.updateTransactionHash(buttonId, hash);
      },

      handleTransactionSuccess: (successText?: string) => {
        this.transactionStateService.completeTransaction(buttonId, successText);
      },

      handleTransactionError: (error: Error, errorText?: string) => {
        this.transactionStateService.errorTransaction(buttonId, error.message, errorText || "❌ Try Again");
      },

      handleApprovalNeeded: (tokenSymbol: string) => {
        this.transactionStateService.startApproval(buttonId, tokenSymbol);
      },

      handleApprovalComplete: () => {
        this.transactionStateService.completeApproval(buttonId);
      },

      updateButtonText: (newText: string) => {
        this.transactionStateService.updateButtonText(buttonId, newText);
      },
    };
  }

  /**
   * Check if any transaction is currently active
   */
  static hasActiveTransaction(): boolean {
    return this.transactionStateService.hasActiveTransaction();
  }

  /**
   * Get all currently active transactions
   */
  static getActiveTransactions(): { buttonId: string; hash?: string }[] {
    return this.transactionStateService.getActiveTransactions();
  }

  /**
   * Reset all transaction buttons (useful for wallet disconnect)
   */
  static resetAllButtons(): void {
    this.transactionStateService.resetAllButtons();
  }

  /**
   * Auto-register common transaction buttons found in the DOM
   * This ensures consistent UX even if components forget to register manually
   */
  static autoRegisterCommonButtons(): void {
    setTimeout(() => {
      // Common transaction button patterns
      const commonButtons = [
        { id: "mintButton", defaultText: "Mint UUSD", pendingText: "Minting..." },
        { id: "redeemButton", defaultText: "Redeem UUSD", pendingText: "Processing..." },
        { id: "exchangeButton", defaultText: "Exchange", pendingText: "Processing..." },
        { id: "approveButton", defaultText: "Approve", pendingText: "Approving..." },
        { id: "collectButton", defaultText: "Collect", pendingText: "Collecting..." },
      ];

      commonButtons.forEach(({ id, defaultText, pendingText }) => {
        const button = document.getElementById(id) as HTMLButtonElement;
        if (button && !this.transactionStateService.getButtonState(id)) {
          const originalText = button.textContent || defaultText;

          this.transactionStateService.registerButton(id, {
            buttonElement: button,
            originalText,
            pendingText,
            onTransactionClick: () => {
              // The button's existing onclick should handle the transaction
            },
          });
        }
      });
    }, 500); // Wait a bit longer for all components to initialize
  }

  /**
   * Demo transaction flow for testing
   */
  static async demoTransactionFlow(buttonId: string): Promise<void> {
    const handlers = this.createTransactionHandlers(buttonId);

    // Start transaction
    handlers.handleTransactionStart();

    // Simulate approval if needed
    await new Promise((resolve) => setTimeout(resolve, 2000));
    handlers.handleApprovalNeeded("LUSD");

    await new Promise((resolve) => setTimeout(resolve, 2000));
    handlers.handleApprovalComplete();

    // Simulate transaction submission
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const mockHash = "0x" + Math.random().toString(16).substr(2, 64);
    handlers.handleTransactionSubmitted(mockHash);

    // Simulate transaction completion
    await new Promise((resolve) => setTimeout(resolve, 3000));
    handlers.handleTransactionSuccess("✅ Demo Complete!");
  }
}

// Auto-register common buttons when DOM is ready
if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      TransactionButtonUtils.autoRegisterCommonButtons();
    });
  } else {
    TransactionButtonUtils.autoRegisterCommonButtons();
  }
}
