import { createAppKit } from '@reown/appkit'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet } from '@reown/appkit/networks'
import { createWalletClient, createPublicClient, custom, http, type Address, type WalletClient, type PublicClient } from "viem";
import { mainnet as viemMainnet } from "viem/chains";
import { validateWalletConnection } from "../utils/validation-utils.ts";
import { RPC_URL } from "../../tools/config.ts";
import { getProjectId } from '../utils/project-id.ts';
import type { Hash, TransactionRequest } from 'viem';




const projectId = getProjectId();
const networks = [mainnet]

// Create adapter
const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId
})

// Instantiate AppKit
const modal = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  themeMode: 'light',
  features: {
    analytics: true,
  },
  metadata: {
    name: 'Ubiquity Dollar',
    description: 'Ubiquity Dollar Protocol',
    url: 'https://ubiquitydollar.com',
    icons: ['https://avatars.githubusercontent.com/u/179229932?s=200&v=4']
  }
})

export const WALLET_EVENTS = {
  CONNECT: "wallet:connect",
  DISCONNECT: "wallet:disconnect",
  ACCOUNT_CHANGED: "wallet:account-changed",
  CONNECTION_ERROR: "wallet:connection-error",
} as const;

export type WalletEvent = (typeof WALLET_EVENTS)[keyof typeof WALLET_EVENTS];

type WalletEventListener<T extends WalletEvent> = T extends typeof WALLET_EVENTS.CONNECT | typeof WALLET_EVENTS.ACCOUNT_CHANGED
  ? (address?: Address | null) => void
  : T extends typeof WALLET_EVENTS.DISCONNECT | typeof WALLET_EVENTS.CONNECTION_ERROR
    ? () => void
    : never;

export class WalletService {
  private _walletClient: WalletClient | null = null;
  private _publicClient: PublicClient;
  private _account: Address | null = null;
  private _eventListeners: Map<WalletEvent, Array<(address?: Address | null) => void>> = new Map();
  private static readonly _storageKey = "uusd_wallet_address";
  private _isConnecting: boolean = false;

  private _appKitModal = modal;

  constructor() {
    this._publicClient = createPublicClient({
      chain: viemMainnet,
      transport: http(RPC_URL),
    });

    this._setupAppKitListeners();
    this._initializeUI();
  }

  private _initializeUI(): void {    
    this._setupUIEventListeners();
  }

  private _setupUIEventListeners(): void {    
    const connectButton = document.getElementById('connectWallet');
    if (connectButton) {
      connectButton.addEventListener('click', () => this.handleConnectClick());
    }
  }

  private _setupAppKitListeners(): void {    
    this._appKitModal.subscribeAccount((state) => {
      console.log('🔗 AppKit Account State:', state);
      
      if (state.isConnected && state.address) {
        this._handleAppKitConnect(state.address as Address);
      } else if (!state.isConnected) {
        this._handleAppKitDisconnect();
      }
    });
    
    this._appKitModal.subscribeState((state) => {
      if (state.open && this._isConnecting) {
        this._showConnectionStatus('Opening wallet connection...', 'info');
      }
    });
  }

  private async handleConnectClick(): Promise<void> {
    if (this._isConnecting) return;
    
    if (this._account) {      
      this.disconnect();
    } else {
      
      try {
        await this.connect();
      } catch (error) {
        console.error("Connection failed:", error);
        this._isConnecting = false;
        this._updateWalletUI(null);
      }
    }
  }

  private _handleAppKitConnect(address: Address): void {
    console.log('✅ AppKit connected:', address);
    
    this._account = address;
    this._isConnecting = false;

    if (window.ethereum) {
      this._walletClient = createWalletClient({
        chain: viemMainnet,
        transport: custom(window.ethereum),
      });
    }

    localStorage.setItem(WalletService._storageKey, address);

    this._emit(WALLET_EVENTS.CONNECT, address);
    this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, address);

    this._updateWalletUI(address);
    this._hideConnectionStatus();
  }

  private _handleAppKitDisconnect(): void {
    console.log('🔌 AppKit disconnected');
    
    this._walletClient = null;
    this._account = null;
    this._isConnecting = false;

    localStorage.removeItem(WalletService._storageKey);

    this._emit(WALLET_EVENTS.DISCONNECT);
    this._emit(WALLET_EVENTS.ACCOUNT_CHANGED, null);

    this._updateWalletUI(null);
    this._hideConnectionStatus();
  }

  private _updateWalletUI(address: Address | null): void {
    const walletInfo = document.getElementById('walletInfo');
    const walletAddress = document.getElementById('walletAddress');
    const connectButton = document.getElementById('connectWallet');
    const exchangeForm = document.getElementById('exchangeForm');
    const directionToggle = document.querySelector('.direction-toggle');

    
    if (walletInfo) {
        if (address && walletAddress) {
            walletInfo.style.display = 'block';
            walletAddress.textContent = `${address.slice(0, 6)}...${address.slice(-4)}`;
        } else {
            walletInfo.style.display = 'none';
        }
    }

    
    if (connectButton) {
      connectButton.textContent = address ? 'Disconnect' : 'Connect Wallet';
      connectButton.classList.remove('loading');
      connectButton.disabled = false;      
    }

    if (exchangeForm) {
      exchangeForm.style.display = address ? 'block' : 'none';
    }

    if (directionToggle) {
      (directionToggle as HTMLElement).style.display = address ? 'flex' : 'none';
    }
  }

  private _showConnectionStatus(message: string, type: 'info' | 'error' = 'info'): void {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
      statusElement.textContent = message;
      statusElement.style.display = 'block';
      statusElement.className = type === 'error' ? 'error' : 'info-text';
    }
  }

  private _hideConnectionStatus(): void {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
      statusElement.style.display = 'none';
    }
  }

  addEventListener<T extends WalletEvent>(event: T, listener: WalletEventListener<T>): void {
    if (!this._eventListeners.has(event)) {
      this._eventListeners.set(event, []);
    }
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      listeners.push(listener);
    }
  }

  removeEventListener<T extends WalletEvent>(event: T, listener: WalletEventListener<T>): void {
    const listeners = this._eventListeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

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

  async connect(): Promise<Address> {
    if (this._isConnecting) {
      throw new Error("Connection already in progress");
    }

    this._isConnecting = true;
    this._showConnectionStatus('Opening wallet connection...', 'info');
    
    const connectButton = document.getElementById('connectWallet');
    if (connectButton) {
      connectButton.textContent = 'Connecting...';
      connectButton.classList.add('loading');      
    }

    try {
      console.log('🔗 Opening AppKit modal...');
      
      // Open AppKit modal
      await this._appKitModal.open();
            
      
      if (!this._account) {
        throw new Error("Connection failed or was cancelled");
      }

      return this._account;
    } catch (error) {
      console.error("❌ Connection failed:", error);
      this._isConnecting = false;

      if (connectButton) {
        connectButton.disabled = false;
        connectButton.classList.remove('loading');
      }

      this._updateWalletUI(null);
      
      const errorMessage = error instanceof Error ? error.message : "Connection failed";
      this._showConnectionStatus(errorMessage, 'error');
      this._emit(WALLET_EVENTS.CONNECTION_ERROR);
      
      throw error;
    }
  }

  disconnect(): void {
    this._isConnecting = false;

    const connectButton = document.getElementById('connectWallet');
    if (connectButton) {
      connectButton.textContent = 'Disconnecting...';      
    }
    this._appKitModal.disconnect();
    setTimeout(() => {
      this._updateWalletUI(null);
    }, 500);
  }

  destroy(): void {
    this._eventListeners.clear();
  }

  getAccount(): Address | null {
    return this._account;
  }

  getWalletClient(): WalletClient {
    if (!this._walletClient) {
      throw new Error("Wallet not connected");
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
    return this._walletClient?.chain || viemMainnet;
  }

  validateConnection() {
    const result = validateWalletConnection(this._account);
    if (!result.isValid) {
      throw new Error(result.error);
    }
  }

  async checkStoredConnection(): Promise<Address | null> {
    const storedAddress = localStorage.getItem(WalletService._storageKey);
    if (!storedAddress) {
      return null;
    }

    console.log("📱 Found stored wallet address:", storedAddress);
    
    this._account = storedAddress as Address;
    this._updateWalletUI(this._account);
    
    return this._account;
  }

  getStoredAddress(): string | null {
    return localStorage.getItem(WalletService._storageKey);
  }

  openModal(): void {
    this._appKitModal.open();
  }

  switchNetwork(chainId: number): void {
    this._appKitModal.switchNetwork(chainId);
  }
  getAppKit() {
    return this._appKitModal;
  }


  async signMessage(message: string): Promise<string> {
    const client = this.getWalletClient();
    const account = this.getAccount();
    if (!account) throw new Error("No account connected");
    
    return await client.signMessage({
      account,
      message,
    });
  }

  async sendTransaction(transaction: TransactionRequest): Promise<Hash> {
    const client = this.getWalletClient();
    const account = this.getAccount();
    if (!account) throw new Error("No account connected");

    const hash = await client.sendTransaction({
      account,
      ...transaction,
    });

    return hash;
  }

  async waitForTransactionReceipt(hash: string) {
    return await this._publicClient.waitForTransactionReceipt({
      hash: hash as `0x${string}`,
    });
  }
}


let walletService: WalletService;

export function initializeWalletService(): WalletService {
  walletService = new WalletService();
  
  walletService.checkStoredConnection().catch(console.error);
  
  return walletService;
}