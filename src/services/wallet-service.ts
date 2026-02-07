import { createWalletClient, createPublicClient, custom, http, type Address, type WalletClient, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { validateWalletConnection } from "../utils/validation-utils.ts";
import { RPC_URL } from "../../tools/config.ts";

type InjectedEthereumProvider = {
  request: (...args: unknown[]) => Promise<unknown>;
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener: (event: string, callback: (...args: unknown[]) => void) => void;
};

function getInjectedEthereumProvider(): InjectedEthereumProvider | null {
  const ethereum = (window as unknown as { ethereum?: unknown }).ethereum;
  if (!ethereum || typeof ethereum !== "object") return null;
  const request = (ethereum as { request?: unknown }).request;
  const on = (ethereum as { on?: unknown }).on;
  const removeListener = (ethereum as { removeListener?: unknown }).removeListener;
  if (typeof request !== "function") return null;
  if (typeof on !== "function") return null;
  if (typeof removeListener !== "function") return null;
  return ethereum as InjectedEthereumProvider;
}

/**
 * Wallet events that can be emitted
 */
export const WALLET_EVENTS = {
  CONNECT: "wallet:connect",
  DISCONNECT: "wallet:disconnect",
  ACCOUNT_CHANGED: "wallet:account-changed",
} as const;

export type WalletEvent = (typeof WALLET_EVENTS)[keyof typeof WALLET_EVENTS];

/**
 * Event listener types for wallet events
 */
type WalletEventListener<T extends WalletEvent> = T extends typeof WALLET_EVENTS.CONNECT | typeof WALLET_EVENTS.ACCOUNT_CHANGED
  ? (address?: Address | null) => void
  : T extends typeof WALLET_EVENTS.DISCONNECT
    ? () => void
    : never;

/**
 * Service responsible for wallet connection and management
 */
export class WalletService {
  protected _walletClient: WalletClient | null = null;
  private _publicClient: PublicClient;
  protected _account: Address | null = null;
  private _eventListeners: Map<WalletEvent, Array<(address?: Address | null) => void>> = new Map();
  private static readonly _storageKey = "uusd_wallet_address";

  // Store MetaMask event handlers for cleanup
  private _metaMaskHandlers: {
    accountsChanged?: (...args: unknown[]) => void;
    chainChanged?: (...args: unknown[]) => void;
    disconnect?: () => void;
  } = {};

  constructor() {
    this._publicClient = createPublicClient({
      chain: mainnet,
      transport: http(RPC_URL),
    });

    // Set up MetaMask event listeners for automatic account switching
    this._setupMetaMaskListeners();
  }

  /**
   * Add an event listener for wallet events
   */
  addEventListener<T extends WalletEvent>(event: T, listener: WalletEventListener<T>): void {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, []);
    }
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.push(listener);
    }
  }

  /**
   * Remove an event listener for wallet events
   */
  removeEventListener<T extends WalletEvent>(event: T, listener: WalletEventListener<T>): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  /**
   * Emit an event to all listeners
   */
  protected _emit(event: WalletEvent, address?: Address | null): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.forEach((listener) => {
        try {
          listener(address);
        } catch (error) {
          console.error(`Error in ${event} listener:`, error);
        }
      });
    }
  }

  /**
   * Connect to user's wallet
   */
  async connect(forceSelection: boolean = false): Promise<Address> {
    const ethereum = getInjectedEthereumProvider();
    if (!ethereum) {
      throw new Error("Please install a wallet extension");
    }

    try {
      if (forceSelection) {
        await Promise.race([
          ethereum.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }],
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Permission request timeout")), 10000)),
        ]);
      }

      this._walletClient = createWalletClient({
        chain: mainnet,
        transport: custom(ethereum),
      });

      const addresses = await Promise.race([
        this._walletClient.requestAddresses(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Address request timeout")), 10000)),
      ]);
      const [address] = addresses;

      this._account = address;

      // Store the connected wallet address in localStorage
      localStorage.setItem(WalletService._storageKey, address);

      this._emit(WALLET_EVENTS.CONNECT, address);

      this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, address);

      return address;
    } catch (error) {
      console.error("🔌 DEBUG: [WalletService] Connect failed:", error);
      throw error;
    }
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    this._walletClient = null;
    this._account = null;

    // Clear stored wallet address from localStorage
    localStorage.removeItem(WalletService._storageKey);

    // Clean up MetaMask event listeners
    this._cleanupMetaMaskListeners();

    this._emit(WALLET_EVENTS.DISCONNECT);
    this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, null);
  }

  /**
   * Clean up the service (to be called when the component/app is destroyed)
   */
  destroy(): void {
    this._cleanupMetaMaskListeners();
    this._eventListeners.clear();
  }

  /**
   * Get current connected account
   */
  getAccount(): Address | null {
    return this._account;
  }

  /**
   * Get wallet client (throws if not connected)
   */
  getWalletClient(): WalletClient {
    if (!this._walletClient) {
      throw new Error("Wallet not connected");
    }
    return this._walletClient;
  }

  /**
   * Get public client for read operations
   */
  getPublicClient(): PublicClient {
    return this._publicClient;
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this._account !== null && this._walletClient !== null;
  }

  /**
   * Get the current chain from wallet client
   */
  getChain() {
    return this._walletClient?.chain || mainnet;
  }

  /**
   * Validate current wallet connection state
   */
  validateConnection() {
    const result = validateWalletConnection(this._account);
    if (!result.isValid) {
      throw new Error(result.error);
    }
  }

  /**
   * Check for stored wallet connection and attempt auto-reconnection
   */
  async checkStoredConnection(): Promise<Address | null> {
    const ethereum = getInjectedEthereumProvider();
    if (!ethereum) {
      console.log("🚫 No ethereum provider found");
      return null;
    }

    const storedAddress = localStorage.getItem(WalletService._storageKey);
    if (!storedAddress) {
      console.log("ℹ️ No stored wallet address found");
      return null;
    }

    console.log("📱 Found stored wallet address:", storedAddress);

    try {
      // Check if the stored address is still available without requiring permission
      // Using eth_accounts returns already-connected accounts without triggering permission prompt
      const availableAccounts = (await ethereum.request({
        method: "eth_accounts",
      })) as string[];

      console.log("🔍 Available accounts from eth_accounts:", availableAccounts);
      console.log("🔍 Looking for stored address:", storedAddress);

      // Check for address match (case-insensitive)
      const normalizedStoredAddress = storedAddress.toLowerCase();
      const normalizedAccounts = availableAccounts.map((addr) => addr.toLowerCase());
      const isAddressMatch = normalizedAccounts.includes(normalizedStoredAddress);

      console.log("🔍 Address match found (case-insensitive):", isAddressMatch);

      if (isAddressMatch) {
        // Account is still available, create wallet client and connect
        this._walletClient = createWalletClient({
          chain: mainnet,
          transport: custom(ethereum),
        });

        this._account = storedAddress as Address;
        console.log("🔄 Auto-reconnected to stored wallet:", storedAddress);

        this._emit(WALLET_EVENTS.CONNECT, this._account);
        this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, this._account);
        return this._account;
      } else if (availableAccounts.length === 0) {
        // No accounts returned by eth_accounts - this could mean:
        // 1. Wallet is locked
        // 2. Site permissions were revoked
        // 3. Wallet provider isn't ready yet
        console.log("⚠️ No accounts returned by eth_accounts. Trying fallback approach...");

        // Try a fallback approach: create wallet client and try to get addresses silently
        try {
          this._walletClient = createWalletClient({
            chain: mainnet,
            transport: custom(ethereum),
          });

          // Try to get addresses without triggering permission prompt
          const addresses = await this._walletClient.getAddresses();

          // Check for address match (case-insensitive)
          const normalizedStoredAddress = storedAddress.toLowerCase();
          const normalizedAddresses = addresses.map((addr) => addr.toLowerCase());
          const isAddressMatch = normalizedAddresses.includes(normalizedStoredAddress);

          if (isAddressMatch) {
            this._account = storedAddress as Address;
            console.log("🔄 Auto-reconnected via fallback method:", storedAddress);

            this._emit(WALLET_EVENTS.CONNECT, this._account);
            this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, this._account);
            return this._account;
          } else {
            console.log("🗑️ Fallback: Stored address not available, clearing:", storedAddress);
            localStorage.removeItem(WalletService._storageKey);
            return null;
          }
        } catch (fallbackError) {
          console.log("❌ Fallback approach also failed:", fallbackError);

          // Try one more approach: check wallet permissions
          try {
            const permissions = (await ethereum.request({
              method: "wallet_getPermissions",
            })) as Array<{ caveats: Array<{ value: string[] }> }>;

            console.log("🔐 Wallet permissions:", permissions);

            // Check if we have eth_accounts permission for the stored address (case-insensitive)
            const normalizedStoredAddress = storedAddress.toLowerCase();
            const ethAccountsPermission = permissions.find((p) =>
              p.caveats?.some((caveat) => caveat.value?.some((addr) => addr.toLowerCase() === normalizedStoredAddress))
            );

            if (ethAccountsPermission) {
              console.log("✅ Found permission for stored address, attempting connection...");
              this._account = storedAddress as Address;

              this._emit(WALLET_EVENTS.CONNECT, this._account);
              this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, this._account);
              return this._account;
            }
          } catch (permError) {
            console.log("❌ Permission check failed:", permError);
          }

          // Don't clear stored address on fallback failure - user might just need to unlock wallet
          return null;
        }
      } else {
        // Some accounts available but not the stored one
        console.log("🗑️ Stored address no longer available, clearing:", storedAddress);
        localStorage.removeItem(WalletService._storageKey);
        return null;
      }
    } catch (error) {
      // Auto-reconnection failed, clear stored address
      console.log("❌ Auto-reconnection failed:", error);
      localStorage.removeItem(WalletService._storageKey);
      return null;
    }
  }

  /**
   * Set up MetaMask event listeners for automatic account switching
   */
  private _setupMetaMaskListeners(): void {
    // Only set up listeners if MetaMask is available
    const ethereum = getInjectedEthereumProvider();
    if (!ethereum) {
      return;
    }

    // Clean up any existing listeners first
    this._cleanupMetaMaskListeners();

    // Create and store account change handler
    this._metaMaskHandlers.accountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      console.log("🔄 MetaMask account change detected:", accounts);
      void this._handleAccountsChanged(accounts).catch((error) => {
        console.error("Error handling account change:", error);
      });
    };

    // Create and store chain change handler
    this._metaMaskHandlers.chainChanged = (...args: unknown[]) => {
      const chainId = args[0] as string;
      console.log("🔗 MetaMask chain change detected:", chainId);
      // For now, just log - you might want to handle chain changes in the future
    };

    // Create and store disconnect handler
    this._metaMaskHandlers.disconnect = () => {
      console.log("🔌 MetaMask disconnect detected");
      // Handle wallet disconnect
      if (this.isConnected()) {
        this.disconnect();
      }
    };

    // Attach the handlers
    ethereum.on("accountsChanged", this._metaMaskHandlers.accountsChanged);
    ethereum.on("chainChanged", this._metaMaskHandlers.chainChanged);
    ethereum.on("disconnect", this._metaMaskHandlers.disconnect);
  }

  /**
   * Clean up MetaMask event listeners
   */
  private _cleanupMetaMaskListeners(): void {
    const ethereum = getInjectedEthereumProvider();
    if (!ethereum) {
      return;
    }

    // Remove all stored event handlers
    if (this._metaMaskHandlers.accountsChanged) {
      ethereum.removeListener("accountsChanged", this._metaMaskHandlers.accountsChanged);
    }
    if (this._metaMaskHandlers.chainChanged) {
      ethereum.removeListener("chainChanged", this._metaMaskHandlers.chainChanged);
    }
    if (this._metaMaskHandlers.disconnect) {
      ethereum.removeListener("disconnect", this._metaMaskHandlers.disconnect);
    }

    // Clear the handlers object
    this._metaMaskHandlers = {};
  }

  /**
   * Handle MetaMask account changes
   */
  private async _handleAccountsChanged(accounts: string[]): Promise<void> {
    try {
      // If no accounts available (wallet locked or disconnected)
      if (!accounts || accounts.length === 0) {
        console.log("🔒 No accounts available - wallet may be locked");
        if (this.isConnected()) {
          this.disconnect();
        }
        return;
      }

      const newAccount = accounts[0] as Address;
      const currentAccount = this._account;

      // If the account actually changed and we were connected
      if (this.isConnected() && currentAccount !== newAccount) {
        console.log("🔄 Account switched from", currentAccount, "to", newAccount);

        // Update internal state
        this._account = newAccount;

        // Update stored address
        localStorage.setItem(WalletService._storageKey, newAccount);

        // Create new wallet client for the new account
        const ethereum = getInjectedEthereumProvider();
        if (ethereum) {
          this._walletClient = createWalletClient({
            chain: mainnet,
            transport: custom(ethereum),
          });
        }

        // Notify listeners of the account change
        this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, newAccount);

        console.log("✅ Account switch completed successfully");
      } else if (!this.isConnected() && newAccount) {
        // If we weren't connected but now have an account, don't auto-connect
        // Let the user manually connect if they want to
        console.log("📱 New account detected but not auto-connecting. User must manually connect.");
      }
    } catch (error) {
      console.error("❌ Error handling account change:", error);
    }
  }

  /**
   * Get stored wallet address without connecting
   */
  getStoredAddress(): string | null {
    return localStorage.getItem(WalletService._storageKey);
  }
}
