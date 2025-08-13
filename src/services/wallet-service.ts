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
  private walletClient: WalletClient | null = null;
  private publicClient: PublicClient;
  private account: Address | null = null;
  private events: Partial<WalletServiceEvents> = {};
  private static readonly STORAGE_KEY = "uusd_wallet_address";

  constructor() {
    this.publicClient = createPublicClient({
      chain: mainnet,
      transport: http(RPC_URL),
    });
  }

  /**
   * Set event handlers for wallet service events
   */
  setEventHandlers(events: Partial<WalletServiceEvents>) {
    this.events = { ...this.events, ...events };
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

      this.walletClient = createWalletClient({
        chain: mainnet,
        transport: custom(window.ethereum),
      });

      const addresses = await Promise.race([
        this.walletClient.requestAddresses(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Address request timeout")), 10000)),
      ]);
      const [address] = addresses;

      this.account = address;

      // Store the connected wallet address in localStorage
      localStorage.setItem(WalletService.STORAGE_KEY, address);

      this.events.onConnect?.(address);

      this.events.onAccountChanged?.(address);

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
    this.walletClient = null;
    this.account = null;

    // Clear stored wallet address from localStorage
    localStorage.removeItem(WalletService.STORAGE_KEY);

    this.events.onDisconnect?.();
    this.events.onAccountChanged?.(null);
  }

  /**
   * Get current connected account
   */
  getAccount(): Address | null {
    return this.account;
  }

  /**
   * Get wallet client (throws if not connected)
   */
  getWalletClient(): WalletClient {
    if (!this.walletClient) {
      throw new Error("Wallet not connected");
    }
    return this.walletClient;
  }

  /**
   * Get public client for read operations
   */
  getPublicClient(): PublicClient {
    return this.publicClient;
  }

  /**
   * Check if wallet is connected
   */
  isConnected(): boolean {
    return this.account !== null && this.walletClient !== null;
  }

  /**
   * Get the current chain from wallet client
   */
  getChain() {
    return this.walletClient?.chain || mainnet;
  }

  /**
   * Validate current wallet connection state
   */
  validateConnection() {
    const result = validateWalletConnection(this.account);
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

    const storedAddress = localStorage.getItem(WalletService.STORAGE_KEY);
    if (!storedAddress) {
      return null;
    }

    try {
      // Try to reconnect without forcing wallet selection
      this.walletClient = createWalletClient({
        chain: mainnet,
        transport: custom(window.ethereum),
      });

      // Check if the stored address is still available in the wallet
      const availableAddresses = await this.walletClient.getAddresses();

      if (availableAddresses.includes(storedAddress as Address)) {
        this.account = storedAddress as Address;
        this.events.onConnect?.(this.account);
        this.events.onAccountChanged?.(this.account);
        return this.account;
      } else {
        // Stored address is no longer available, clear it
        localStorage.removeItem(WalletService.STORAGE_KEY);
        return null;
      }
    } catch (_error) {
      // Auto-reconnection failed, clear stored address
      localStorage.removeItem(WalletService.STORAGE_KEY);
      return null;
    }
  }

  /**
   * Get stored wallet address without connecting
   */
  getStoredAddress(): string | null {
    return localStorage.getItem(WalletService.STORAGE_KEY);
  }
}
