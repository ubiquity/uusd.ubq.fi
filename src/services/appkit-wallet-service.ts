import { type Address } from "viem";
import { WalletService, WALLET_EVENTS } from "./wallet-service.ts";
import { initializeAppKit, wagmiConfig, projectId } from "../config/appkit-config.ts";
import type { AppKit } from "@reown/appkit";
import { getAccount, watchAccount, getWalletClient } from "@wagmi/core";

/**
 * Enhanced Wallet Service with AppKit Integration
 * Extends your existing WalletService to work with Reown AppKit
 */
export class AppKitWalletService extends WalletService {
  private _appKit: AppKit | null = null;
  private _unwatchAccount: (() => void) | null = null;

  constructor() {
    super();
    this._initializeAppKit();
  }

  /**
   * Initialize AppKit
   */
  private _initializeAppKit(): void {
    try {
      this._appKit = initializeAppKit();
      this._setupWagmiWatcher();
    } catch (error) {
      console.error("Failed to initialize AppKit:", error);
    }
  }

  /**
   * Setup Wagmi account watcher for immediate state updates
   */
  private _setupWagmiWatcher(): void {
    // Watch for account changes using Wagmi directly
    this._unwatchAccount = watchAccount(wagmiConfig, {
      onChange: (account) => {
        if (account.isConnected && account.address) {
          // Immediately sync connection
          console.log("Detected connection event");
          this._syncFromAppKit(account.address as Address);
        } else if (!account.isConnected) {
          // Immediately sync disconnection
          console.log("Detected disconnection event");
          this._syncDisconnect();
        }
      },
    });
  }

  /**
   * Update wallet client
   */
  private async _updateWalletClient(): Promise<void> {
    this._walletClient = await getWalletClient(wagmiConfig);
    console.log("Wallet client updated: ", this._walletClient);
  }

  /**
   * Sync wallet connection from AppKit to internal state
   */
  private _syncFromAppKit(address: Address): void {
    console.log("Syncing connection to WalletService:", address);

    // Update internal account state
    this._account = address;

    // Update the wallet client
    this._updateWalletClient()
      .then(() => {
        console.log("Wallet client updated");
      })
      .catch((err) => {
        console.error(`Error getting wallet client: ${err}`);
      });

    // Store connection for auto-reconnect
    if (typeof window !== "undefined") {
      localStorage.setItem("wallet_connected", "true");
      localStorage.setItem("wallet_address", address);
    }

    // Emit connect event
    this._emit(WALLET_EVENTS.CONNECT, address);
  }

  /**
   * Sync disconnect from AppKit
   */
  private _syncDisconnect(): void {
    console.log("Syncing disconnection to WalletService");

    this._account = null;

    // Clear stored connection
    if (typeof window !== "undefined") {
      localStorage.removeItem("wallet_connected");
      localStorage.removeItem("wallet_address");
    }

    // parent cleanup
    super.disconnect();
  }

  /**
   * Override connect to use AppKit modal
   */
  override async connect(forceWalletSelection = false): Promise<Address> {
    if (!this._appKit) {
      console.warn("AppKit not initialized, falling back to original connect");
      return super.connect(forceWalletSelection);
    }

    try {
      // Check if already connected via Wagmi
      const currentAccount = getAccount(wagmiConfig);
      if (currentAccount.isConnected && currentAccount.address && !forceWalletSelection) {
        console.log("Already connected via Wagmi:", currentAccount.address);
        const address = currentAccount.address as Address;
        this._syncFromAppKit(address);
        return address;
      }

      console.log("Opening AppKit modal...");

      // Open AppKit modal
      await this._appKit.open();

      // Wait for connection with periodic checks
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Connection timeout - wallet connection took too long"));
        }, 60000); // 60 second timeout

        // Check every 200ms for connection
        const checkInterval = setInterval(() => {
          const account = getAccount(wagmiConfig);

          if (account.isConnected && account.address) {
            clearTimeout(timeout);
            clearInterval(checkInterval);

            const address = account.address as Address;
            console.log("Connection detected:", address);

            // Sync to internal state
            this._syncFromAppKit(address);

            // Close modal
            this._appKit
              ?.close()
              .then(() => {})
              .catch((err) => {
                console.error("Error closing appkit modal:", err);
              });

            resolve(address);
          }
        }, 200);
      });
    } catch (error) {
      console.error("AppKit connection failed:", error);
      throw error;
    }
  }

  /**
   * Override disconnect to use AppKit
   * This will be changed as appkit has it's own disconnect interface
   */
  override disconnect(): void {
    console.log("Opening AppKit modal...");
    this.openAppKitModal();
  }

  /**
   * Directly disconnect from appkit and wallet service
   */
  directDisconnect(): void {
    if (this._appKit) {
      this._appKit
        .disconnect()
        .then(() => {})
        .catch((err) => {
          console.log("Error disconnecting wallet:", err);
        });
    }

    /** cleanup from parent */
    super.disconnect();
  }

  /**
   * Check for stored wallet connection
   */
  override async checkStoredConnection(): Promise<Address | null> {
    console.log("Checking for stored connection...");

    // First check Wagmi state
    const account = getAccount(wagmiConfig);
    if (account.isConnected && account.address) {
      const address = account.address as Address;
      console.log("Found connected account via Wagmi:", address);
      this._syncFromAppKit(address);
      return address;
    }

    // Fall back to parent implementation
    return super.checkStoredConnection();
  }

  /**
   * Open AppKit modal programmatically
   */
  openAppKitModal(): void {
    if (this._appKit) {
      this._appKit
        .open()
        .then(() => {})
        .catch((err) => {
          console.error("Error opening appkit modal", err);
        });
    }
  }

  /**
   * Get Connect button text content
   */
  getButtonDisplay(): string {
    if (this.isConnected()) {
      const account = this.getAccount();
      if (account) {
        return `${account.slice(0, 6)}…${account.slice(-4)}`;
      }
      return "Connect Wallet";
    } else {
      return "Connect Wallet";
    }
  }

  /**
   * Get AppKit instance for advanced usage
   */
  getAppKit(): AppKit | null {
    return this._appKit;
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    const account = getAccount(wagmiConfig);
    return account.isConnected && account.address !== undefined;
  }

  /**
   * Check if wallet service is configured and ready for use
   */
  isConfigured(): boolean {
    return projectId !== undefined;
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    if (this._unwatchAccount) {
      this._unwatchAccount();
      this._unwatchAccount = null;
    }
  }
}
