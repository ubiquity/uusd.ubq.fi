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
}

/**
 * Service responsible for wallet connection and management
 */
export class WalletService {
    private walletClient: WalletClient | null = null;
    private publicClient: PublicClient;
    private account: Address | null = null;
    private events: Partial<WalletServiceEvents> = {};

    constructor() {
        this.publicClient = createPublicClient({
            chain: mainnet,
            transport: http(RPC_URL)
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
    async connect(): Promise<Address> {
        if (!window.ethereum) {
            throw new Error('Please install a wallet extension');
        }

        // Force wallet selection dialog by requesting permissions
        // This ensures MetaMask shows account selection even after previous connections
        await window.ethereum.request({
            method: 'wallet_requestPermissions',
            params: [{ eth_accounts: {} }]
        });

        this.walletClient = createWalletClient({
            chain: mainnet,
            transport: custom(window.ethereum)
        });

        const [address] = await this.walletClient.requestAddresses();
        this.account = address;

        this.events.onConnect?.(address);
        this.events.onAccountChanged?.(address);

        return address;
    }

    /**
     * Disconnect wallet
     */
    disconnect(): void {
        this.walletClient = null;
        this.account = null;

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
}
