import { createAppKit } from '@reown/appkit'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { mainnet } from '@reown/appkit/networks'
import { createWalletClient, createPublicClient, custom, http, type Address, type WalletClient, type PublicClient } from "viem";
import { mainnet as viemMainnet } from "viem/chains";
import { validateWalletConnection } from "../utils/validation-utils.ts";
import { RPC_URL } from "../../tools/config.ts";


const WALLET_EVENTS = {
  CONNECT: "wallet:connect",
  DISCONNECT: "wallet:disconnect",
  ACCOUNT_CHANGED: "wallet:account-changed",
  CONNECTION_ERROR: "wallet:connection-error",
} as const;

const UI_ELEMENTS = {
  CONNECT_BUTTON: 'connectWallet',
  WALLET_INFO: 'walletInfo',
  WALLET_ADDRESS: 'walletAddress',
  EXCHANGE_FORM: 'exchangeForm',
  DIRECTION_TOGGLE: '.direction-toggle',
  CONNECTION_STATUS: 'connectionStatus'
} as const;

const CONFIG = {
  STORAGE_KEY: "uusd_wallet_address",
  DEFAULT_PROJECT_ID: process.env.REOWN_PROJECT_ID,
  CONNECTION_TIMEOUT: 3000,
  ADDRESS_DISPLAY_LENGTH: { start: 6, end: 4 }
} as const;


class EnvironmentUtils {
  static getProjectId(): string {
    const envSources = [
      // Bun
      () => typeof Bun !== 'undefined' && Bun.env?.REOWN_PROJECT_ID,
      // Deno
      () => typeof Deno !== 'undefined' && Deno.env?.get('REOWN_PROJECT_ID'),
      // Node.js
      () => typeof process !== 'undefined' && process.env?.REOWN_PROJECT_ID
    ];

    for (const source of envSources) {
      const projectId = source();
      if (projectId) return projectId;
    }

    return CONFIG.DEFAULT_PROJECT_ID;
  }
}


class UIManager {
  private elements: Map<string, HTMLElement | null> = new Map();

  constructor() {
    this.initializeElements();
  }

  private initializeElements(): void {
    Object.values(UI_ELEMENTS).forEach(key => {
      this.elements.set(key, document.getElementById(key) || document.querySelector(key));
    });
  }

  getElement(key: string): HTMLElement | null {
    return this.elements.get(key) || null;
  }

  updateConnectButton(state: 'connect' | 'disconnect' | 'loading', isConnected: boolean = false): void {
    const button = this.getElement(UI_ELEMENTS.CONNECT_BUTTON);
    if (!button) return;

    const states = {
      connect: { text: 'Connect Wallet', loading: false },
      disconnect: { text: 'Disconnect', loading: false },
      loading: { text: 'Connecting...', loading: true }
    };

    const { text, loading } = states[state];
    button.textContent = text;
    button.classList.toggle('loading', loading);
  }

  updateWalletInfo(address: Address | null): void {
    const walletInfo = this.getElement(UI_ELEMENTS.WALLET_INFO);
    const walletAddress = this.getElement(UI_ELEMENTS.WALLET_ADDRESS);

    if (walletInfo) {
      walletInfo.style.display = address ? 'block' : 'none';
    }

    if (walletAddress && address) {
      walletAddress.textContent = this.formatAddress(address);
    }
  }

  toggleMainContent(show: boolean): void {
    const exchangeForm = this.getElement(UI_ELEMENTS.EXCHANGE_FORM);
    const directionToggle = this.getElement(UI_ELEMENTS.DIRECTION_TOGGLE);

    [exchangeForm, directionToggle].forEach(element => {
      if (element) {
        element.style.display = show ? 'block' : 'none';
      }
    });

    if (directionToggle) {
      (directionToggle as HTMLElement).style.display = show ? 'flex' : 'none';
    }
  }

  showConnectionStatus(message: string, type: 'info' | 'error' = 'info'): void {
    const statusElement = this.getElement(UI_ELEMENTS.CONNECTION_STATUS);
    if (!statusElement) return;

    statusElement.textContent = message;
    statusElement.style.display = 'block';
    statusElement.className = type === 'error' ? 'error' : 'info-text';
  }

  hideConnectionStatus(): void {
    const statusElement = this.getElement(UI_ELEMENTS.CONNECTION_STATUS);
    if (statusElement) {
      statusElement.style.display = 'none';
    }
  }

  private formatAddress(address: Address): string {
    const { start, end } = CONFIG.ADDRESS_DISPLAY_LENGTH;
    return `${address.slice(0, start)}...${address.slice(-end)}`;
  }
}


class StorageManager {
  static getStoredAddress(): string | null {
    return localStorage.getItem(CONFIG.STORAGE_KEY);
  }

  static storeAddress(address: Address): void {
    localStorage.setItem(CONFIG.STORAGE_KEY, address);
  }

  static removeAddress(): void {
    localStorage.removeItem(CONFIG.STORAGE_KEY);
  }
}


type WalletEvent = typeof WALLET_EVENTS[keyof typeof WALLET_EVENTS];
type WalletEventListener = (address?: Address | null) => void;

class EventManager {
  private listeners: Map<WalletEvent, WalletEventListener[]> = new Map();

  addEventListener(event: WalletEvent, listener: WalletEventListener): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  removeEventListener(event: WalletEvent, listener: WalletEventListener): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;

    const index = eventListeners.indexOf(listener);
    if (index > -1) {
      eventListeners.splice(index, 1);
    }
  }

  emit(event: WalletEvent, address?: Address | null): void {
    const eventListeners = this.listeners.get(event);
    if (!eventListeners) return;

    eventListeners.forEach(listener => {
      try {
        listener(address);
      } catch (error) {
        console.error(`Error in ${event} listener:`, error);
      }
    });
  }

  clear(): void {
    this.listeners.clear();
  }
}


export class WalletService {
  private _walletClient: WalletClient | null = null;
  private _publicClient: PublicClient;
  private _account: Address | null = null;
  private _isConnecting: boolean = false;

  private _uiManager: UIManager;
  private _eventManager: EventManager;
  private _appKitModal: ReturnType<typeof createAppKit>;

  constructor() {
    this._uiManager = new UIManager();
    this._eventManager = new EventManager();
    this._publicClient = this.createPublicClient();
    this._appKitModal = this.initializeAppKit();

    this.initialize();
  }

  private initialize(): void {
    this.setupAppKitListeners();
    this.setupUIEventListeners();
  }

  private createPublicClient(): PublicClient {
    return createPublicClient({
      chain: viemMainnet,
      transport: http(RPC_URL),
    });
  }

  private initializeAppKit() {
    const projectId = EnvironmentUtils.getProjectId();
    const networks = [mainnet];

    const wagmiAdapter = new WagmiAdapter({ networks, projectId });

    return createAppKit({
      adapters: [wagmiAdapter],
      networks,
      projectId,
      themeMode: 'light',
      features: { analytics: true },
      metadata: {
        name: 'Ubiquity Dollar',
        description: 'Ubiquity Dollar',
        url: 'https://uusd.ubq.fi',
        icons: ['https://avatars.githubusercontent.com/u/76412717?s=200&v=4']
      }
    });
  }

  private setupUIEventListeners(): void {
    const connectButton = this._uiManager.getElement(UI_ELEMENTS.CONNECT_BUTTON);
    if (connectButton) {
      connectButton.addEventListener('click', () => this.handleConnectClick());
    }
  }

  private setupAppKitListeners(): void {
    this._appKitModal.subscribeAccount((state) => {
      console.log('🔗 AppKit Account State:', state);

      if (state.isConnected && state.address) {
        this.handleAppKitConnect(state.address as Address);
      } else if (!state.isConnected) {
        this.handleAppKitDisconnect();
      }
    });

    this._appKitModal.subscribeState((state) => {
      if (state.open && this._isConnecting) {
        this._uiManager.showConnectionStatus('Opening wallet connection...', 'info');
      }
    });
  }

  private async handleConnectClick(): Promise<void> {
    if (this._isConnecting) return;

    if (this._account) {
      this.disconnect();
    } else {
      await this.connect();
    }
  }

  private handleAppKitConnect(address: Address): void {
    console.log('✅ AppKit connected:', address);

    this._account = address;
    this._isConnecting = false;

    this.initializeWalletClient();
    StorageManager.storeAddress(address);

    this._eventManager.emit(WALLET_EVENTS.CONNECT, address);
    this._eventManager.emit(WALLET_EVENTS.ACCOUNT_CHANGED, address);

    this.updateUI();
  }

  private handleAppKitDisconnect(): void {
    console.log('🔌 AppKit disconnected');

    this._walletClient = null;
    this._account = null;
    this._isConnecting = false;

    StorageManager.removeAddress();

    this._eventManager.emit(WALLET_EVENTS.DISCONNECT);
    this._eventManager.emit(WALLET_EVENTS.ACCOUNT_CHANGED, null);

    this.updateUI();
  }

  private initializeWalletClient(): void {
    if (window.ethereum) {
      this._walletClient = createWalletClient({
        chain: viemMainnet,
        transport: custom(window.ethereum),
      });
    }
  }

  private updateUI(): void {
    const isConnected = this._account !== null;

    this._uiManager.updateWalletInfo(this._account);
    this._uiManager.updateConnectButton(
      isConnected ? 'disconnect' : 'connect',
      isConnected
    );
    this._uiManager.toggleMainContent(isConnected);

    if (!isConnected) {
      this._uiManager.hideConnectionStatus();
    }
  }

  // ========== PUBLIC API ==========
  addEventListener(event: WalletEvent, listener: WalletEventListener): void {
    this._eventManager.addEventListener(event, listener);
  }

  removeEventListener(event: WalletEvent, listener: WalletEventListener): void {
    this._eventManager.removeEventListener(event, listener);
  }

  async connect(): Promise<Address> {
    if (this._isConnecting) {
      throw new Error("Connection already in progress");
    }

    this._isConnecting = true;
    this._uiManager.showConnectionStatus('Opening wallet connection...', 'info');
    this._uiManager.updateConnectButton('loading');

    try {
      console.log('🔗 Opening AppKit modal...');

      await this._appKitModal.open();
      await new Promise(resolve => setTimeout(resolve, CONFIG.CONNECTION_TIMEOUT));

      if (!this._account) {
        throw new Error("Connection failed or was cancelled");
      }

      return this._account;
    } catch (error) {
      this.handleConnectionError(error);
      throw error;
    }
  }

  private handleConnectionError(error: unknown): void {
    console.error("❌ Connection failed:", error);
    this._isConnecting = false;

    this._uiManager.updateConnectButton('connect');
    this._uiManager.updateWalletInfo(null);

    const errorMessage = error instanceof Error ? error.message : "Connection failed";
    this._uiManager.showConnectionStatus(errorMessage, 'error');
    this._eventManager.emit(WALLET_EVENTS.CONNECTION_ERROR);
  }

  disconnect(): void {
    this._isConnecting = false;
    this._uiManager.updateConnectButton('disconnect');

    this._appKitModal.disconnect();

    setTimeout(() => {
      this.updateUI();
    }, 500);
  }

  destroy(): void {
    this._eventManager.clear();
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
    const storedAddress = StorageManager.getStoredAddress();
    if (!storedAddress) return null;

    console.log("📱 Found stored wallet address:", storedAddress);

    this._account = storedAddress as Address;
    this.updateUI();

    return this._account;
  }

  getStoredAddress(): string | null {
    return StorageManager.getStoredAddress();
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

    return await client.signMessage({ account, message });
  }

  async sendTransaction(transaction: any): Promise<string> {
    const client = this.getWalletClient();
    const account = this.getAccount();
    if (!account) throw new Error("No account connected");

    const hash = await client.sendTransaction({ account, ...transaction });
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

export { WALLET_EVENTS };
export type { WalletEvent, WalletEventListener };