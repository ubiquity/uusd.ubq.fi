import { createAppKit, type AppKit } from "@reown/appkit";
import { mainnet as appKitMainnet } from "@reown/appkit/networks";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { disconnect as wagmiDisconnect, getAccount, getWalletClient, reconnect, watchAccount } from "@wagmi/core";
import { createPublicClient, createWalletClient, custom, http, type Address, type PublicClient, type WalletClient } from "viem";
import { mainnet } from "viem/chains";
import { validateWalletConnection } from "../utils/validation-utils.ts";
import { RPC_URL } from "../../tools/config.ts";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, callback: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, callback: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    REOWN_PROJECT_ID?: string;
  }
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

const REOWN_PROJECT_ID_STORAGE_KEY = "reown_project_id";

/**
 * Service responsible for wallet connection and management.
 *
 * Reown AppKit is used when a project id is configured. The direct injected
 * wallet fallback keeps local development working until production provides
 * a Reown project id.
 */
export class WalletService {
  private _walletClient: WalletClient | null = null;
  private _publicClient: PublicClient;
  private _account: Address | null = null;
  private _eventListeners: Map<WalletEvent, Array<(address?: Address | null) => void>> = new Map();
  private _appKit: AppKit | null = null;
  private _wagmiAdapter: WagmiAdapter | null = null;
  private _unwatchAccount: (() => void) | null = null;
  private static readonly _storageKey = "uusd_wallet_address";

  // Store injected wallet event handlers for cleanup.
  private _injectedWalletHandlers: {
    accountsChanged?: (...args: unknown[]) => void;
    chainChanged?: (...args: unknown[]) => void;
    disconnect?: () => void;
  } = {};

  constructor() {
    this._publicClient = createPublicClient({
      chain: mainnet,
      transport: http(RPC_URL, { batch: true }),
    });

    this._setupInjectedWalletListeners();
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
  private _emit(event: WalletEvent, address?: Address | null): void {
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
    const projectId = this._getReownProjectId();
    if (!projectId) {
      return this._connectInjectedWallet(forceSelection);
    }

    const appKit = this._getOrCreateAppKit(projectId);
    await appKit.open({ view: "Connect" });
    return this._waitForReownConnection();
  }

  /**
   * Disconnect wallet
   */
  disconnect(): void {
    if (this._appKit) {
      void this._appKit.disconnect("eip155").catch((error) => {
        console.warn("Reown disconnect failed:", error);
      });
    } else if (this._wagmiAdapter) {
      void wagmiDisconnect(this._wagmiAdapter.wagmiConfig).catch((error) => {
        console.warn("Wagmi disconnect failed:", error);
      });
    }

    this._clearConnectionState();
  }

  /**
   * Clean up the service (to be called when the component/app is destroyed)
   */
  destroy(): void {
    this._cleanupInjectedWalletListeners();
    this._unwatchAccount?.();
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
    const projectId = this._getReownProjectId();
    if (projectId) {
      const appKit = this._getOrCreateAppKit(projectId);
      const account = appKit.getAccount("eip155");
      if (account?.isConnected && account.address) {
        return this._setConnectedAccount(account.address as Address);
      }

      if (this._wagmiAdapter) {
        await reconnect(this._wagmiAdapter.wagmiConfig);
        const wagmiAccount = getAccount(this._wagmiAdapter.wagmiConfig);
        if (wagmiAccount.isConnected && wagmiAccount.address) {
          return this._setConnectedAccount(wagmiAccount.address);
        }
      }
      return null;
    }

    return this._checkStoredInjectedWalletConnection();
  }

  /**
   * Get stored wallet address without connecting
   */
  getStoredAddress(): string | null {
    return localStorage.getItem(WalletService._storageKey);
  }

  private _getReownProjectId(): string | null {
    const metaProjectId = document.querySelector<HTMLMetaElement>('meta[name="reown-project-id"]')?.content.trim();
    const projectId = window.REOWN_PROJECT_ID?.trim() || metaProjectId || localStorage.getItem(REOWN_PROJECT_ID_STORAGE_KEY)?.trim();
    return projectId || null;
  }

  private _getOrCreateAppKit(projectId: string): AppKit {
    if (this._appKit) {
      return this._appKit;
    }

    this._wagmiAdapter = new WagmiAdapter({
      networks: [appKitMainnet],
      projectId,
    });

    this._appKit = createAppKit({
      adapters: [this._wagmiAdapter],
      networks: [appKitMainnet],
      projectId,
      metadata: {
        name: "Ubiquity Dollar",
        description: "Ubiquity Dollar exchange",
        url: window.location.origin,
        icons: [`${window.location.origin}/favicon.png`],
      },
      features: {
        analytics: false,
      },
    });

    this._unwatchAccount = watchAccount(this._wagmiAdapter.wagmiConfig, {
      onChange: (account) => {
        if (account.isConnected && account.address) {
          void this._setConnectedAccount(account.address).catch((error) => {
            console.error("Failed to sync Reown account:", error);
          });
        } else if (this._account) {
          this._clearConnectionState();
        }
      },
    });

    this._appKit.subscribeAccount((account) => {
      if (account.isConnected && account.address) {
        void this._setConnectedAccount(account.address as Address).catch((error) => {
          console.error("Failed to sync Reown account:", error);
        });
      } else if (this._account) {
        this._clearConnectionState();
      }
    }, "eip155");

    return this._appKit;
  }

  private async _waitForReownConnection(): Promise<Address> {
    if (!this._wagmiAdapter) {
      throw new Error("Wallet connection is not initialized");
    }

    const existingAccount = getAccount(this._wagmiAdapter.wagmiConfig);
    if (existingAccount.isConnected && existingAccount.address) {
      return this._setConnectedAccount(existingAccount.address);
    }

    return new Promise<Address>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unwatch();
        reject(new Error("Wallet connection timeout"));
      }, 120000);

      const unwatch = watchAccount(this._wagmiAdapter!.wagmiConfig, {
        onChange: (account) => {
          if (account.isConnected && account.address) {
            clearTimeout(timeout);
            unwatch();
            void this._setConnectedAccount(account.address).then(resolve, reject);
          }
        },
      });
    });
  }

  private async _setConnectedAccount(address: Address): Promise<Address> {
    this._account = address;
    localStorage.setItem(WalletService._storageKey, address);

    if (this._wagmiAdapter) {
      this._walletClient = await getWalletClient(this._wagmiAdapter.wagmiConfig);
    }
    const provider = this._getEthereumProvider();
    if (!this._wagmiAdapter && provider) {
      this._walletClient = createWalletClient({
        account: address,
        chain: mainnet,
        transport: custom(provider),
      });
    }

    this._emit(WALLET_EVENTS.CONNECT, address);
    this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, address);
    return address;
  }

  private _clearConnectionState(): void {
    this._walletClient = null;
    this._account = null;
    localStorage.removeItem(WalletService._storageKey);
    this._emit(WALLET_EVENTS.DISCONNECT);
    this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, null);
  }

  private async _connectInjectedWallet(forceSelection: boolean = false): Promise<Address> {
    const provider = this._getEthereumProvider();
    if (!provider) {
      throw new Error("Please install a wallet extension or configure a Reown project id");
    }

    try {
      if (forceSelection) {
        await Promise.race([
          provider.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }],
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Permission request timeout")), 60000)),
        ]);
      }

      this._walletClient = createWalletClient({
        chain: mainnet,
        transport: custom(provider),
      });

      const addresses = await Promise.race([
        this._walletClient.requestAddresses(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Address request timeout")), 60000)),
      ]);
      const [address] = addresses;

      return this._setConnectedAccount(address);
    } catch (error) {
      console.error("Wallet connect failed:", error);
      throw error;
    }
  }

  private async _checkStoredInjectedWalletConnection(): Promise<Address | null> {
    const provider = this._getEthereumProvider();
    if (!provider) {
      console.log("No ethereum provider found");
      return null;
    }

    const storedAddress = localStorage.getItem(WalletService._storageKey);
    if (!storedAddress) {
      console.log("No stored wallet address found");
      return null;
    }

    try {
      const availableAccounts = (await provider.request({
        method: "eth_accounts",
      })) as string[];

      const normalizedStoredAddress = storedAddress.toLowerCase();
      const normalizedAccounts = availableAccounts.map((addr) => addr.toLowerCase());
      const isAddressMatch = normalizedAccounts.includes(normalizedStoredAddress);

      if (isAddressMatch) {
        return this._setConnectedAccount(storedAddress as Address);
      }

      localStorage.removeItem(WalletService._storageKey);
      return null;
    } catch (error) {
      console.log("Auto-reconnection failed:", error);
      localStorage.removeItem(WalletService._storageKey);
      return null;
    }
  }

  /**
   * Set up injected wallet event listeners for automatic account switching
   */
  private _setupInjectedWalletListeners(): void {
    const provider = this._getEthereumProvider();
    if (!provider?.on) {
      return;
    }

    this._cleanupInjectedWalletListeners();

    this._injectedWalletHandlers.accountsChanged = (...args: unknown[]) => {
      const accounts = args[0] as string[];
      void this._handleInjectedAccountsChanged(accounts).catch((error) => {
        console.error("Error handling account change:", error);
      });
    };

    this._injectedWalletHandlers.chainChanged = (...args: unknown[]) => {
      const chainId = args[0] as string;
      console.log("Injected wallet chain change detected:", chainId);
    };

    this._injectedWalletHandlers.disconnect = () => {
      if (this.isConnected()) {
        this.disconnect();
      }
    };

    provider.on("accountsChanged", this._injectedWalletHandlers.accountsChanged);
    provider.on("chainChanged", this._injectedWalletHandlers.chainChanged);
    provider.on("disconnect", this._injectedWalletHandlers.disconnect);
  }

  /**
   * Clean up injected wallet event listeners
   */
  private _cleanupInjectedWalletListeners(): void {
    const provider = this._getEthereumProvider();
    if (!provider?.removeListener) {
      return;
    }

    if (this._injectedWalletHandlers.accountsChanged) {
      provider.removeListener("accountsChanged", this._injectedWalletHandlers.accountsChanged);
    }
    if (this._injectedWalletHandlers.chainChanged) {
      provider.removeListener("chainChanged", this._injectedWalletHandlers.chainChanged);
    }
    if (this._injectedWalletHandlers.disconnect) {
      provider.removeListener("disconnect", this._injectedWalletHandlers.disconnect);
    }

    this._injectedWalletHandlers = {};
  }

  /**
   * Handle injected wallet account changes
   */
  private async _handleInjectedAccountsChanged(accounts: string[]): Promise<void> {
    if (!accounts || accounts.length === 0) {
      if (this.isConnected()) {
        this.disconnect();
      }
      return;
    }

    const newAccount = accounts[0] as Address;
    const currentAccount = this._account;

    if (this.isConnected() && currentAccount !== newAccount) {
      await this._setConnectedAccount(newAccount);
    }
  }

  private _getEthereumProvider(): EthereumProvider | null {
    const provider = window.ethereum as EthereumProvider | undefined;
    return typeof provider?.request === "function" ? provider : null;
  }
}
