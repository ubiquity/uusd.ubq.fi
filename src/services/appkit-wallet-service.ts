import { type Address } from "viem";
import { WalletService, WALLET_EVENTS } from "./wallet-service.ts";
import { initializeAppKit, wagmiConfig } from "../config/appkit-config.ts";
import type { AppKit } from '@reown/appkit';
import { getAccount, watchAccount, getWalletClient } from '@wagmi/core';

/**
 * Enhanced Wallet Service with AppKit Integration
 * Extends your existing WalletService to work with Reown AppKit
 */
export class AppKitWalletService extends WalletService {
  private appKit: AppKit | null = null;
  private unsubscribeAppKit: (() => void) | null = null;
  private unwatchAccount: (() => void) | null = null;

  constructor() {
    super();
    this.initializeAppKit();
  }

  /**
   * Initialize AppKit
   */
  private initializeAppKit(): void {
    try {
      this.appKit = initializeAppKit();
      this.setupAppKitEventListeners();
      this.setupWagmiWatcher();
    } catch (error) {
      console.error('Failed to initialize AppKit:', error);
    }
  }

  /**
   * Setup Wagmi account watcher for immediate state updates
   */
  private setupWagmiWatcher(): void {
    // Watch for account changes using Wagmi directly
    this.unwatchAccount = watchAccount(wagmiConfig, {
      onChange: (account) => {
        console.log('Wagmi account changed:', account);
        
        if (account.isConnected && account.address) {
          // Immediately sync connection
          console.log("Detected connection event")
          this._syncFromAppKit(account.address as Address);
        } else if (!account.isConnected && this.isConnected()) {
          // Immediately sync disconnection
          console.log("Detected disconnection event")
          this._syncDisconnect();
        }
      }
    });
  }

  /**
   * Setup AppKit event listeners
   */
  private setupAppKitEventListeners(): void {
    if (!this.appKit) return;

    // Subscribe to AppKit state changes
    this.unsubscribeAppKit = this.appKit.subscribeState((state) => {
      
      const address = state.address as Address | undefined;
      const isConnected = state.isConnected;

      // Sync with existing wallet service state
      if (isConnected && address && address !== this.getAccount()) {
        this._syncFromAppKit(address);
      } else if (!isConnected && this.isConnected()) {
        this._syncDisconnect();
      }
    });
  }

  /**
   * Sync wallet connection from AppKit to internal state
   */
  private _syncFromAppKit(address: Address): void {
    console.log('Syncing connection to WalletService:', address);
    
    // Update internal account state
    this._account = address;
    
    // Store connection for auto-reconnect
    if (typeof window !== 'undefined') {
      localStorage.setItem('wallet_connected', 'true');
      localStorage.setItem('wallet_address', address);
    }

    // Emit connect event
    this._emit(WALLET_EVENTS.CONNECT, address);
  }

  /**
   * Sync disconnect from AppKit
   */
  private _syncDisconnect(): void {
    console.log('Syncing disconnection to WalletService');
    
    this._account = null;
    
    // Clear stored connection
    if (typeof window !== 'undefined') {
      localStorage.removeItem('wallet_connected');
      localStorage.removeItem('wallet_address');
    }

    // Emit disconnect event
    this._emit(WALLET_EVENTS.DISCONNECT);
  }

  /**
   * Override connect to use AppKit modal
   */
  override async connect(forceWalletSelection = false): Promise<Address> {
    if (!this.appKit) {
      console.warn('AppKit not initialized, falling back to original connect');
      return super.connect(forceWalletSelection);
    }

    try {
      // Check if already connected via Wagmi
      const currentAccount = getAccount(wagmiConfig);
      if (currentAccount.isConnected && currentAccount.address && !forceWalletSelection) {
        console.log('Already connected via Wagmi:', currentAccount.address);
        const address = currentAccount.address as Address;
        this._syncFromAppKit(address);
        return address;
      }

      console.log('Opening AppKit modal...');
      
      // Open AppKit modal
      await this.appKit.open();
      
      this._walletClient = await getWalletClient(wagmiConfig);

      // Wait for connection with periodic checks
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout - wallet connection took too long'));
        }, 60000); // 60 second timeout

        // Check every 200ms for connection
        const checkInterval = setInterval(() => {
          const account = getAccount(wagmiConfig);
          
          if (account.isConnected && account.address) {
            clearTimeout(timeout);
            clearInterval(checkInterval);
            
            const address = account.address as Address;
            console.log('✅ Connection detected:', address);
            
            // Sync to internal state
            this._syncFromAppKit(address);
            
            // Close modal
            this.appKit?.close();
            
            resolve(address);
          }
        }, 200);
      });
    } catch (error) {
      console.error('AppKit connection failed:', error);
      throw error;
    }
  }

  /**
   * Override disconnect to use AppKit
   */
  override disconnect(): void {
    console.log('Disconnecting via AppKit...');
    
    if (this.appKit) {
      this.appKit.disconnect();
    }
    
    // Also call parent disconnect for cleanup
    super.disconnect();
  }

  /**
   * Check for stored wallet connection
   */
  override async checkStoredConnection(): Promise<Address | null> {
    console.log('Checking for stored connection...');
    
    // First check Wagmi state
    const account = getAccount(wagmiConfig);
    if (account.isConnected && account.address) {
      const address = account.address as Address;
      console.log('Found connected account via Wagmi:', address);
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
    if (this.appKit) {
      this.appKit.open();
    }
  }

  /**
   * Get AppKit instance for advanced usage
   */
  getAppKit(): AppKit | null {
    return this.appKit;
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    const account = getAccount(wagmiConfig);
    return account.isConnected && account.address !== undefined
  }

  /**
   * Cleanup on destroy
   */
  destroy(): void {
    if (this.unsubscribeAppKit) {
      this.unsubscribeAppKit();
      this.unsubscribeAppKit = null;
    }
    
    if (this.unwatchAccount) {
      this.unwatchAccount();
      this.unwatchAccount = null;
    }
  }
}