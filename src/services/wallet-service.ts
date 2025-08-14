import {
    createWalletClient,
    createPublicClient,
    custom,
    http,
    type Address,
    type WalletClient,
    type PublicClient
} from 'viem';
import { mainnet } from 'viem/chains';
import { validateWalletConnection } from '../utils/validation-utils.ts';
import { RPC_URL } from '../../tools/config.ts';

/**
 * Interface for wallet service events
 */
export interface WalletServiceEvents {
    onAccountChanged: (account: Address | null) => void;
    onConnect: (account: Address) => void;
    onDisconnect: () => void;
    onChainChanged?: (chainId: string) => void;
}

/**
 * Wallet event types for better organization
 */
export const WALLET_EVENTS = {
    CONNECT: 'connect',
    DISCONNECT: 'disconnect',
    ACCOUNT_CHANGED: 'accountChanged',
    CHAIN_CHANGED: 'chainChanged'
} as const;

/**
 * Service responsible for wallet connection and management
 */
export class WalletService {
    private walletClient: WalletClient | null = null;
    private publicClient: PublicClient;
    private account: Address | null = null;
    private events: Partial<WalletServiceEvents> = {};
    private eventListeners: Map<string, Function[]> = new Map();
    private isListeningToWalletEvents = false;
    private readonly STORAGE_KEY = 'walletConnection';

    constructor() {
        this.publicClient = createPublicClient({
            chain: mainnet,
            transport: http(RPC_URL)
        });
        
        // Setup wallet event listeners if ethereum is available
        if (window.ethereum) {
            this.setupWalletEventListeners();
        }
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
    async connect(forceAccountSelection = false): Promise<Address> {
        if (!window.ethereum) {
            throw new Error('Please install a wallet extension');
        }

        this.walletClient = createWalletClient({
            chain: mainnet,
            transport: custom(window.ethereum)
        });

        // Force account selection if requested or no accounts connected
        if (forceAccountSelection) {
            const [address] = await this.walletClient.requestAddresses();
            this.account = address;
        } else {
            // Try to get existing connected accounts first
            const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as Address[];
            if (accounts.length > 0) {
                this.account = accounts[0];
            } else {
                // No existing connection, request access
                const [address] = await this.walletClient.requestAddresses();
                this.account = address;
            }
        }

        // Store the connected address
        if (this.account) {
            this.storeConnection(this.account);
            this.events.onConnect?.(this.account);
            this.events.onAccountChanged?.(this.account);
            
            // Start listening to wallet events
            this.startListeningToWalletEvents();
        }

        return this.account;
    }

    /**
     * Disconnect wallet
     */
    disconnect(): void {
        this.walletClient = null;
        this.account = null;

        // Clear stored connection
        this.clearStoredConnection();
        
        // Stop listening to wallet events
        this.stopListeningToWalletEvents();

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
            throw new Error('Wallet not connected');
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
     * Validate current wallet connection state
     */
    validateConnection() {
        const result = validateWalletConnection(this.account);
        if (!result.isValid) {
            throw new Error(result.error);
        }
    }

    /**
     * Setup wallet event listeners for account/chain changes
     */
    private setupWalletEventListeners(): void {
        if (!window.ethereum || this.isListeningToWalletEvents) return;

        // Account changed handler
        const handleAccountsChanged = (accounts: string[]) => {
            if (accounts.length === 0) {
                // User disconnected all accounts
                this.disconnect();
            } else if (accounts[0] !== this.account) {
                // User switched to a different account
                const newAccount = accounts[0] as Address;
                this.account = newAccount;
                this.storeConnection(newAccount);
                this.events.onAccountChanged?.(newAccount);
            }
        };

        // Chain changed handler
        const handleChainChanged = (chainId: string) => {
            this.events.onChainChanged?.(chainId);
            // Reload the page as recommended by MetaMask
            window.location.reload();
        };

        // Store handlers for cleanup
        this.accountsChangedHandler = handleAccountsChanged;
        this.chainChangedHandler = handleChainChanged;
    }

    /**
     * Start listening to wallet events
     */
    private startListeningToWalletEvents(): void {
        if (!window.ethereum || this.isListeningToWalletEvents) return;

        window.ethereum.on('accountsChanged', this.accountsChangedHandler);
        window.ethereum.on('chainChanged', this.chainChangedHandler);
        this.isListeningToWalletEvents = true;
    }

    /**
     * Stop listening to wallet events
     */
    private stopListeningToWalletEvents(): void {
        if (!window.ethereum || !this.isListeningToWalletEvents) return;

        if (this.accountsChangedHandler) {
            window.ethereum.removeListener('accountsChanged', this.accountsChangedHandler);
        }
        if (this.chainChangedHandler) {
            window.ethereum.removeListener('chainChanged', this.chainChangedHandler);
        }
        this.isListeningToWalletEvents = false;
    }

    /**
     * Store wallet connection in localStorage
     */
    private storeConnection(address: Address): void {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
                address,
                timestamp: Date.now()
            }));
        } catch (e) {
            console.warn('Failed to store wallet connection:', e);
        }
    }

    /**
     * Clear stored wallet connection
     */
    private clearStoredConnection(): void {
        try {
            localStorage.removeItem(this.STORAGE_KEY);
        } catch (e) {
            console.warn('Failed to clear stored connection:', e);
        }
    }

    /**
     * Check for stored wallet connection and attempt reconnection
     */
    async checkStoredConnection(): Promise<Address | null> {
        try {
            const stored = localStorage.getItem(this.STORAGE_KEY);
            if (!stored) return null;

            const { address } = JSON.parse(stored);
            
            // Verify the wallet is still connected
            if (window.ethereum) {
                const accounts = await window.ethereum.request({ method: 'eth_accounts' }) as Address[];
                
                if (accounts.includes(address)) {
                    // Reconnect to the stored address
                    await this.connect();
                    return this.account;
                } else {
                    // Stored address no longer has permission
                    this.clearStoredConnection();
                }
            }
        } catch (e) {
            console.warn('Failed to check stored connection:', e);
            this.clearStoredConnection();
        }
        
        return null;
    }

    /**
     * Add event listener (new event system)
     */
    addEventListener(event: string, callback: Function): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(callback);
    }

    /**
     * Remove event listener
     */
    removeEventListener(event: string, callback: Function): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Emit event to all listeners
     */
    private emit(event: string, ...args: any[]): void {
        const listeners = this.eventListeners.get(event);
        if (listeners) {
            listeners.forEach(callback => {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`Error in ${event} event listener:`, error);
                }
            });
        }
    }

    // Handler references for cleanup
    private accountsChangedHandler?: (accounts: string[]) => void;
    private chainChangedHandler?: (chainId: string) => void;
}
