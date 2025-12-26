import { type Address } from "viem";
import { WalletService, WALLET_EVENTS } from "./wallet-service.ts";
import { initializeAppKit, wagmiConfig } from "../config/appkit-config.ts";
import type { AppKit } from '@reown/appkit';

/**
 * Enhanced Wallet Service with AppKit Integration
 * Extends existing WalletService to work with Reown AppKit
 */
export class AppKitWalletService extends WalletService {
  private appKit: AppKit | null = null;
  private unsubscribeAppKit: (() => void) | null = null;

  constructor() {
    super();
    this.initializeAppKit();
  }

  /**
   * Initialize AppKit and setup event listeners
   */
  private initializeAppKit(): void {
    try {
      this.appKit = initializeAppKit();
      this.setupAppKitEventListeners();
    } catch (error) {
      console.error('Failed to initialize AppKit:', error);
    }
  }

  /**
   * Setup AppKit event listeners to sync with existing WalletService
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
    this._account = address;
    
    // Store connection for auto-reconnect
    if (typeof window !== 'undefined') {
      localStorage.setItem('wallet_connected', 'true');
      localStorage.setItem('wallet_address', address);
    }

    // Emit connect event
    this.emit(WALLET_EVENTS.CONNECT, address);
  }

  /**
   * Sync disconnect from AppKit
   */
  private _syncDisconnect(): void {
    this._account = null;
    
    // Clear stored connection
    if (typeof window !== 'undefined') {
      localStorage.removeItem('wallet_connected');
      localStorage.removeItem('wallet_address');
    }

    // Emit disconnect event
    this.emit(WALLET_EVENTS.DISCONNECT);
  }

  /**
   * Override connect to use AppKit modal
   */
  override async connect(forceWalletSelection = false): Promise<Address> {
    if (!this.appKit) {
      // Fallback to original connect if AppKit not available
      return super.connect(forceWalletSelection);
    }

    try {
      // Open AppKit modal
      await this.appKit.open();

      // Wait for connection
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 30000); // 30 second timeout

        const checkConnection = () => {
          const account = this.getAccount();
          if (account) {
            clearTimeout(timeout);
            resolve(account);
          } else {
            setTimeout(checkConnection, 100);
          }
        };

        checkConnection();
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
    if (this.appKit) {
      this.appKit.disconnect();
    }
    
    // Also call parent disconnect for cleanup
    super.disconnect();
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
   * Cleanup on destroy
   */
  destroy(): void {
    if (this.unsubscribeAppKit) {
      this.unsubscribeAppKit();
      this.unsubscribeAppKit = null;
    }
  }
}