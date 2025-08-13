import { createWalletClient, createPublicClient, custom, http, type Address, type WalletClient, type PublicClient } from "viem";
import { mainnet } from "viem/chains";
import { validateWalletConnection } from "../utils/validation-utils.ts";
import { RPC_URL } from "../../tools/config.ts";

/**
 * Interface for wallet service events
 */
export interface WalletServiceEvents {
  onAccountChanged: (account: Address | null) => void;
  onConnect: (account: Address) => void;
  onDisconnect: () => void;
}

/**
 * Service responsible for wallet connection and management
 */
export class WalletService {
  private _walletClient: WalletClient | null = null;
  private _publicClient: PublicClient;
  private _account: Address | null = null;
  private _events: Partial<WalletServiceEvents> = {};
  private static readonly _storageKey = "uusd_wallet_address";

  constructor() {
    this._publicClient = createPublicClient({
      chain: mainnet,
      transport: http(RPC_URL),
    });
  }

  /**
   * Set event handlers for wallet service events
   */
  setEventHandlers(events: Partial<WalletServiceEvents>) {
    this._events = { ...this._events, ...events };
  }

  /**
   * Connect to user's wallet
   */
  async connect(forceSelection: boolean = false): Promise<Address> {
    if (!window.ethereum) {
      throw new Error("Please install a wallet extension");
    }

    try {
      if (forceSelection) {
        await Promise.race([
          window.ethereum.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }],
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Permission request timeout")), 10000)),
        ]);
      }

      this._walletClient = createWalletClient({
        chain: mainnet,
        transport: custom(window.ethereum),
      });

      const addresses = await Promise.race([
        this._walletClient.requestAddresses(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Address request timeout")), 10000)),
      ]);
      const [address] = addresses;

      this._account = address;

      // Store the connected wallet address in localStorage
      localStorage.setItem(WalletService._storageKey, address);

      this._events.onConnect?.(address);

      this._events.onAccountChanged?.(address);

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

    this._events.onDisconnect?.();
    this._events.onAccountChanged?.(null);
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
    if (!window.ethereum) {
      return null;
    }

    const storedAddress = localStorage.getItem(WalletService._storageKey);
    if (!storedAddress) {
      return null;
    }

    try {
      // Try to reconnect without forcing wallet selection
      this._walletClient = createWalletClient({
        chain: mainnet,
        transport: custom(window.ethereum),
      });

      // Check if the stored address is still available in the wallet
      const availableAddresses = await this._walletClient.getAddresses();

      if (availableAddresses.includes(storedAddress as Address)) {
        this._account = storedAddress as Address;
        this._events.onConnect?.(this._account);
        this._events.onAccountChanged?.(this._account);
        return this._account;
      } else {
        // Stored address is no longer available, clear it
        localStorage.removeItem(WalletService._storageKey);
        return null;
      }
    } catch {
      // Auto-reconnection failed, clear stored address
      localStorage.removeItem(WalletService._storageKey);
      return null;
    }
  }

  /**
   * Get stored wallet address without connecting
   */
  getStoredAddress(): string | null {
    return localStorage.getItem(WalletService._storageKey);
  }
}
