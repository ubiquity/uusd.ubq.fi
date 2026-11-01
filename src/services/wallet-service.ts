import { disconnect, getAccount, getWalletClient, reconnect, watchAccount } from "@wagmi/core";
import { type Address, createPublicClient, http, type PublicClient, type WalletClient } from "viem";
import { mainnet } from "viem/chains";
import { getWalletConfig } from "../config/wallet-config.ts";
import { validateWalletConnection } from "../utils/validation-utils.ts";
import { RPC_URL } from "../../tools/config.ts";

export const WALLET_EVENTS = {
  CONNECT: "wallet:connect",
  DISCONNECT: "wallet:disconnect",
  ACCOUNT_CHANGED: "wallet:account-changed",
} as const;

export type WalletEvent = (typeof WALLET_EVENTS)[keyof typeof WALLET_EVENTS];
type WalletEventListener = (address?: Address | null) => void;

/** Bridges AppKit's EVM connectors to the application's existing viem services. */
export class WalletService {
  private _walletClient: WalletClient | null = null;
  private _publicClient: PublicClient;
  private _account: Address | null = null;
  private _eventListeners = new Map<WalletEvent, WalletEventListener[]>();
  private _config?: ReturnType<typeof getWalletConfig>;
  private _unwatch?: () => void;
  private _finishConnection?: (error?: unknown, address?: Address) => void;
  private _connectionVersion = 0;
  private static readonly _storageKey = "uusd_wallet_address";

  constructor() {
    this._publicClient = createPublicClient({
      chain: mainnet,
      transport: http(RPC_URL, { batch: true }),
    });
  }

  addEventListener(event: WalletEvent, listener: WalletEventListener): void {
    const listeners = this._eventListeners.get(event) ?? [];
    listeners.push(listener);
    this._eventListeners.set(event, listeners);
  }

  removeEventListener(event: WalletEvent, listener: WalletEventListener): void {
    const listeners = this._eventListeners.get(event);
    const index = listeners?.indexOf(listener) ?? -1;
    if (listeners && index >= 0) listeners.splice(index, 1);
  }

  private _emit(event: WalletEvent, address?: Address | null): void {
    for (const listener of this._eventListeners.get(event) ?? []) {
      try {
        listener(address);
      } catch (error) {
        console.error(`Error in ${event} listener:`, error);
      }
    }
  }

  private _initialize() {
    if (!this._config) {
      this._config = getWalletConfig();
      this._unwatch = watchAccount(this._config.wagmiConfig, {
        onChange: () => {
          void this._syncAccount().catch((error: unknown) => {
            this._finishConnection?.(error);
            console.error("Unable to update wallet connection:", error);
          });
        },
      });
    }
    return this._config;
  }

  /** Synchronize account AND chain; never use an injected provider instead of the selected connector. */
  private async _syncAccount(): Promise<void> {
    if (!this._config) return;
    const version = ++this._connectionVersion;
    const account = getAccount(this._config.wagmiConfig);
    if (account.status === "disconnected") {
      this._clearConnection();
      return;
    }
    if (!account.isConnected || !account.address) return;

    const previousAccount = this._account;
    const previousChainId = this._walletClient?.chain?.id;
    this._walletClient = null;
    let client: WalletClient;
    try {
      client = await getWalletClient(this._config.wagmiConfig);
    } catch (error) {
      if (version !== this._connectionVersion) return;
      throw error;
    }
    // An account switch or disconnect may have happened while resolving the connector.
    if (version !== this._connectionVersion) return;
    this._walletClient = client;
    this._account = account.address;
    localStorage.setItem(WalletService._storageKey, account.address);
    if (!previousAccount) this._emit(WALLET_EVENTS.CONNECT, account.address);
    if (previousAccount !== account.address || previousChainId !== client.chain?.id) {
      this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, account.address);
    }
    this._finishConnection?.(undefined, account.address);
  }

  async connect(): Promise<Address> {
    if (this._finishConnection) throw new Error("A wallet connection is already in progress.");
    const { appKit, wagmiConfig } = this._initialize();
    return await new Promise<Address>((resolve, reject) => {
      let hasOpened = false;
      let unsubscribe = () => {};
      let isFinished = false;
      const finish = (error?: unknown, address?: Address) => {
        if (isFinished) return;
        isFinished = true;
        clearTimeout(timeout);
        unsubscribe();
        if (this._finishConnection === finish) this._finishConnection = undefined;
        if (address) resolve(address);
        else reject(error);
      };
      const timeout = setTimeout(() => finish(new Error("Wallet connection timed out. Please try again.")), 180000);
      this._finishConnection = finish;
      unsubscribe = appKit.subscribeState((state: { open: boolean }) => {
        if (state.open) hasOpened = true;
        else if (hasOpened && !getAccount(wagmiConfig).isConnected) {
          finish(new Error("Wallet connection cancelled."));
        }
      });
      void appKit.open({ view: "Connect" }).catch(finish);
      if (getAccount(wagmiConfig).isConnected) {
        void this._syncAccount().catch(finish);
      }
    });
  }

  async openAccount(): Promise<void> {
    await this._initialize().appKit.open({ view: "Account" });
  }

  async disconnect(): Promise<void> {
    this._finishConnection?.(new Error("Wallet disconnected."));
    if (this._config) await disconnect(this._config.wagmiConfig);
    this._clearConnection();
  }

  private _clearConnection(): void {
    const isConnected = this._account !== null;
    ++this._connectionVersion;
    this._walletClient = null;
    this._account = null;
    localStorage.removeItem(WalletService._storageKey);
    if (isConnected) {
      this._emit(WALLET_EVENTS.DISCONNECT);
      this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, null);
    }
  }

  destroy(): void {
    this._finishConnection?.(new Error("Wallet service destroyed."));
    this._unwatch?.();
    ++this._connectionVersion;
    this._eventListeners.clear();
  }

  getAccount(): Address | null {
    return this._account;
  }

  getWalletClient(): WalletClient {
    if (!this._walletClient) throw new Error("Wallet not connected");
    // UUSD contracts and read clients are deployed on Ethereum, not every AppKit network.
    const chainId = this._config ? getAccount(this._config.wagmiConfig).chainId : undefined;
    if (chainId !== mainnet.id || this._walletClient.chain?.id !== mainnet.id) {
      throw new Error("Switch to Ethereum Mainnet in Manage Wallet before making transactions.");
    }
    return this._walletClient;
  }

  getPublicClient(): PublicClient {
    return this._publicClient;
  }

  isConnected(): boolean {
    return this._account !== null && this._walletClient !== null;
  }

  getChain() {
    return this._walletClient?.chain;
  }

  validateConnection(): void {
    const result = validateWalletConnection(this._account);
    if (!result.isValid) throw new Error(result.error);
    this.getWalletClient();
  }

  async checkStoredConnection(): Promise<Address | null> {
    if (!this.getStoredAddress()) return null;
    const { wagmiConfig } = this._initialize();
    await reconnect(wagmiConfig);
    await this._syncAccount();
    return this._account;
  }

  getStoredAddress(): string | null {
    return localStorage.getItem(WalletService._storageKey);
  }
}
