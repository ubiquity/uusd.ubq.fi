import type { Address, WalletClient } from "viem";
import { getAccount, getWalletClient, watchAccount } from "@wagmi/core";

import { getOrCreateAppKit, reownProjectId, wagmiConfig } from "../config/appkit-config.ts";
import { WALLET_EVENTS, WalletService } from "./wallet-service.ts";

const LEGACY_STORAGE_KEY = "uusd_wallet_address";

export class AppKitWalletService extends WalletService {
  private _unwatch: (() => void) | null = null;

  constructor() {
    super();

    // Only enable AppKit when REOWN_PROJECT_ID is configured.
    if (reownProjectId) {
      this._unwatch = watchAccount(wagmiConfig, {
        onChange: (account) => {
          if (account.isConnected && account.address) {
            void this._syncConnected(account.address as Address);
            return;
          }

          if (!account.isConnected) {
            this._syncDisconnected();
          }
        },
      });
    }
  }

  override destroy(): void {
    this._unwatch?.();
    this._unwatch = null;
    super.destroy();
  }

  private async _syncConnected(address: Address): Promise<void> {
    this._account = address;

    // Persist for legacy auto-reconnect behavior.
    try {
      localStorage.setItem(LEGACY_STORAGE_KEY, address);
    } catch {
      // ignore (privacy mode, etc.)
    }

    try {
      const client = (await getWalletClient(wagmiConfig)) as WalletClient | null;
      if (client) this._walletClient = client;
    } catch (err) {
      console.warn("Failed to get wagmi wallet client:", err);
    }

    this._emit(WALLET_EVENTS.CONNECT, address);
    this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, address);
  }

  private _syncDisconnected(): void {
    this._walletClient = null;
    this._account = null;

    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // ignore
    }

    this._emit(WALLET_EVENTS.DISCONNECT);
    this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, null);
  }

  override async connect(forceSelection: boolean = false): Promise<Address> {
    const appKit = getOrCreateAppKit();
    if (!appKit) {
      // No REOWN_PROJECT_ID: keep the existing MetaMask behavior.
      return super.connect(forceSelection);
    }

    const current = getAccount(wagmiConfig);
    if (!forceSelection && current.isConnected && current.address) {
      const addr = current.address as Address;
      await this._syncConnected(addr);
      return addr;
    }

    await appKit.open();

    return await new Promise<Address>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Wallet connection timed out")), 60_000);

      const interval = setInterval(() => {
        const account = getAccount(wagmiConfig);
        if (!account.isConnected || !account.address) return;

        clearTimeout(timeout);
        clearInterval(interval);

        const addr = account.address as Address;
        void this._syncConnected(addr)
          .then(() => resolve(addr))
          .catch(reject)
          .finally(() => {
            void appKit.close().catch(() => {});
          });
      }, 200);
    });
  }

  override disconnect(): void {
    const appKit = getOrCreateAppKit();
    if (!appKit) {
      super.disconnect();
      return;
    }

    void appKit.disconnect().catch((err) => console.warn("AppKit disconnect failed:", err));
    this._syncDisconnected();
  }

  override async checkStoredConnection(): Promise<Address | null> {
    // Prefer wagmi state when AppKit is enabled.
    if (reownProjectId) {
      const account = getAccount(wagmiConfig);
      if (account.isConnected && account.address) {
        const addr = account.address as Address;
        await this._syncConnected(addr);
        return addr;
      }
    }

    return super.checkStoredConnection();
  }
}
