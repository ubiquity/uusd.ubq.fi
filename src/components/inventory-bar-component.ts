import type { Address } from 'viem';
import type { WalletService } from '../services/wallet-service.ts';
import type { ContractService } from '../services/contract-service.ts';
import type { PriceService } from '../services/price-service.ts';
import type { NotificationManager } from './notification-manager.ts';
import type { TokenBalance, InventoryBarState, TokenMetadata, INVENTORY_TOKENS } from '../types/inventory.types.ts';
import {
    formatTokenAmount,
    formatUsdValue,
    calculateTotalUsdValue,
    isBalanceZero,
    createBalanceDisplayText
} from '../utils/token-utils.ts';
import { batchFetchTokenBalances } from '../utils/batch-request-utils.ts';

/**
 * Service dependencies for InventoryBarComponent
 */
export interface InventoryBarServices {
    walletService: WalletService;
    contractService: ContractService;
    priceService: PriceService;
    notificationManager: NotificationManager;
}

/**
 * Callback type for balance update notifications
 */
export type BalanceUpdateCallback = (balances: TokenBalance[]) => void;

/**
 * Inventory Bar Component
 * Displays token balances (LUSD, UUSD, UBQ) at the bottom of the page with USD values
 */
export class InventoryBarComponent {
    private services: InventoryBarServices;
    private state: InventoryBarState;
    private updateInterval: number | null = null;
    private readonly UPDATE_INTERVAL_MS = 60000; // 60 seconds - less aggressive refresh
    private balanceUpdateCallbacks: BalanceUpdateCallback[] = [];

    constructor(services: InventoryBarServices) {
        this.services = services;
        this.state = {
            isConnected: false,
            isLoading: false,
            balances: [],
            totalUsdValue: 0
        };

        this.initializeComponent();
        this.setupEventHandlers();
    }

    /**
     * Initialize the inventory bar component
     */
    private initializeComponent(): void {
        this.renderInventoryBar();
        this.updateConnectionState();
    }

    /**
     * Setup event handlers for wallet connection changes
     */
    private setupEventHandlers(): void {
        // Note: Wallet connection events are handled by the main app
        // We'll check the initial connection state and rely on public methods
        const account = this.services.walletService.getAccount();
        if (account) {
            this.state.isConnected = true;
            this.updateConnectionState();
            this.loadBalances();
            this.startPeriodicUpdates();
        }
    }

    /**
     * Handle wallet connection
     */
    private async handleWalletConnect(account: Address): Promise<void> {
        console.log('🔌 [INVENTORY-DEBUG] handleWalletConnect called');
        this.state.isConnected = true;
        this.updateConnectionState();

        // Use background refresh if we already have some balances (reconnection)
        // Use initial load if no balances exist (fresh connection)
        const isReconnection = this.state.balances.length > 0;
        await this.loadBalances(!isReconnection); // Background refresh for reconnections
        this.startPeriodicUpdates();
    }

    /**
     * Handle wallet disconnection
     */
    private handleWalletDisconnect(): void {
        this.state.isConnected = false;
        this.state.balances = [];
        this.state.totalUsdValue = 0;
        this.updateConnectionState();
        this.stopPeriodicUpdates();
        this.renderBalances();
    }

    /**
     * Update wallet connection state in UI
     */
    private updateConnectionState(): void {
        const inventoryBar = document.getElementById('inventory-bar');
        if (!inventoryBar) return;

        if (this.state.isConnected) {
            inventoryBar.classList.remove('disconnected');
            inventoryBar.classList.add('connected');
        } else {
            inventoryBar.classList.remove('connected');
            inventoryBar.classList.add('disconnected');
        }
    }

    /**
     * Load token balances for the connected wallet using JSON-RPC 2.0 batch requests
     */
    private async loadBalances(isBackgroundRefresh: boolean = false): Promise<void> {
        if (!this.state.isConnected) return;

        const account = this.services.walletService.getAccount();
        if (!account) return;

        // 🔍 DEBUG: Track refresh triggers
        console.log(`🔄 [INVENTORY-DEBUG] loadBalances called - isBackgroundRefresh: ${isBackgroundRefresh}, hasExistingBalances: ${this.state.balances.length > 0}, timestamp: ${new Date().toISOString()}`);

        this.state.isLoading = true;

        // Only show loading state if no existing balances OR if this is initial load
        if (!isBackgroundRefresh || this.state.balances.length === 0) {
            console.log('🔄 [INVENTORY-DEBUG] Showing loading state - clearing displayed balances');
            this.renderLoadingState();
        } else {
            console.log('🔄 [INVENTORY-DEBUG] Background refresh - keeping existing balances visible');
            this.showBackgroundRefreshIndicator();
        }

        try {
            const publicClient = this.services.walletService.getPublicClient();

            // Import token metadata
            const { INVENTORY_TOKENS } = await import('../types/inventory.types.ts');

            // Prepare tokens for batch request
            const tokens = Object.values(INVENTORY_TOKENS).map(token => ({
                address: token.address,
                symbol: token.symbol
            }));

            // Execute batch request for all token balances
            const batchResults = await batchFetchTokenBalances(publicClient, tokens, account);

            // Process results and calculate USD values
            const balancePromises = batchResults.map(async (result): Promise<TokenBalance> => {
                const tokenMetadata = INVENTORY_TOKENS[result.symbol];
                if (!tokenMetadata) {
                    throw new Error(`Token metadata not found for ${result.symbol}`);
                }

                return {
                    symbol: result.symbol,
                    address: result.tokenAddress,
                    balance: result.balance,
                    decimals: tokenMetadata.decimals,
                    usdValue: await this.calculateUsdValue(result.symbol, result.balance, tokenMetadata.decimals)
                };
            });

            const balances = await Promise.all(balancePromises);

            this.state.balances = balances;
            this.state.totalUsdValue = calculateTotalUsdValue(balances);
            this.state.isLoading = false;

            this.renderBalances();

            // Hide background refresh indicator after successful update
            this.hideBackgroundRefreshIndicator();

            // 🔥 NEW: Trigger auto-population when balances are loaded/updated
            this.notifyBalancesUpdated();

        } catch (error) {
            console.error('Failed to load token balances:', error);
            this.state.isLoading = false;
            this.hideBackgroundRefreshIndicator();
            this.services.notificationManager.showError('mint', 'Failed to load token balances');
            this.renderErrorState();
        }
    }

    /**
     * Calculate USD value for a token balance
     */
    private async calculateUsdValue(symbol: string, balance: bigint, decimals: number): Promise<number> {
        if (isBalanceZero(balance, decimals)) {
            return 0;
        }

        try {
            // Get token price based on symbol
            let priceInUsd = 1; // Default fallback price

            if (symbol === 'UUSD') {
                const rawPrice = await this.services.contractService.getDollarPriceUsd();
                priceInUsd = Number(rawPrice) / 1000000; // Convert from 6-decimal precision
            } else if (symbol === 'UBQ') {
                const rawPrice = await this.services.contractService.getGovernancePrice();
                priceInUsd = Number(rawPrice) / 1000000; // Convert from 6-decimal precision
            } else if (symbol === 'LUSD') {
                const rawPrice = await this.services.contractService.getLUSDOraclePrice();
                priceInUsd = Number(rawPrice) / 1000000; // Convert from 6-decimal precision
            }

            const tokenAmount = Number(balance) / Math.pow(10, decimals);
            return tokenAmount * priceInUsd;

        } catch (error) {
            console.warn(`Failed to get price for ${symbol}:`, error);
            return 0; // Return 0 if price lookup fails
        }
    }

    /**
     * Start periodic balance updates
     */
    private startPeriodicUpdates(): void {
        this.stopPeriodicUpdates(); // Clear existing interval
        this.updateInterval = window.setInterval(() => {
            console.log(`⏰ [INVENTORY-DEBUG] Periodic refresh triggered (every ${this.UPDATE_INTERVAL_MS / 1000}s)`);
            this.loadBalances(true); // Mark as background refresh
        }, this.UPDATE_INTERVAL_MS);
        console.log(`⏰ [INVENTORY-DEBUG] Started periodic updates every ${this.UPDATE_INTERVAL_MS / 1000} seconds`);
    }

    /**
     * Stop periodic balance updates
     */
    private stopPeriodicUpdates(): void {
        if (this.updateInterval) {
            window.clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    /**
     * Render the inventory bar HTML structure
     */
    private renderInventoryBar(): void {
        const inventoryBar = document.getElementById('inventory-bar');
        if (!inventoryBar) return;

        inventoryBar.innerHTML = `
            <div class="inventory-content">
                <div class="inventory-header">
                    <span class="inventory-title">Token Balances</span>
                    <div class="header-right">
                        <span class="background-refresh-indicator" id="bg-refresh-indicator" style="display: none;">
                            <span class="refresh-spinner"></span>
                        </span>
                        <span class="total-value" id="inventory-total">$0.00</span>
                    </div>
                </div>
                <div class="inventory-tokens" id="inventory-tokens">
                    <div class="disconnected-message">Connect wallet to view balances</div>
                </div>
            </div>
        `;
    }

    /**
     * Render loading state
     */
    private renderLoadingState(): void {
        const tokensContainer = document.getElementById('inventory-tokens');
        if (!tokensContainer) return;

        tokensContainer.innerHTML = `
            <div class="loading-message">
                <span class="loading-spinner"></span>
                Loading balances...
            </div>
        `;
    }

    /**
     * Render error state
     */
    private renderErrorState(): void {
        const tokensContainer = document.getElementById('inventory-tokens');
        if (!tokensContainer) return;

        tokensContainer.innerHTML = `
            <div class="error-message">
                Failed to load balances
                <button class="retry-button" onclick="this.loadBalances()">Retry</button>
            </div>
        `;
    }

    /**
     * Render token balances
     */
    private renderBalances(): void {
        const tokensContainer = document.getElementById('inventory-tokens');
        const totalValueElement = document.getElementById('inventory-total');

        if (!tokensContainer || !totalValueElement) return;

        if (!this.state.isConnected) {
            tokensContainer.innerHTML = '<div class="disconnected-message">Connect wallet to view balances</div>';
            totalValueElement.textContent = '$0.00';
            return;
        }

        if (this.state.balances.length === 0) {
            tokensContainer.innerHTML = '<div class="no-balances-message">No token balances found</div>';
            totalValueElement.textContent = '$0.00';
            return;
        }

        // Render individual token balances
        const tokenElements = this.state.balances.map(balance => {
            const amount = formatTokenAmount(balance.balance, balance.decimals);
            const usdValue = balance.usdValue ? formatUsdValue(balance.usdValue) : '';
            const isZero = isBalanceZero(balance.balance, balance.decimals);

            return `
                <div class="token-balance ${isZero ? 'zero-balance' : ''}">
                    <div class="token-info">
                        <div class="token-symbol">${balance.symbol}</div>
                        <div class="token-amount">${amount}</div>
                        ${usdValue ? `<div class="token-usd-value">${usdValue}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');

        tokensContainer.innerHTML = tokenElements;
        totalValueElement.textContent = formatUsdValue(this.state.totalUsdValue);
    }

    /**
     * Force refresh balances (public method)
     */
    public async refreshBalances(): Promise<void> {
        console.log('🔄 [INVENTORY-DEBUG] Manual refresh called from external component');
        if (this.state.isConnected) {
            await this.loadBalances(false); // Manual refresh shows loading state
        }
    }

    /**
     * Get current balances state (public method for debugging)
     */
    public getBalances(): TokenBalance[] {
        return [...this.state.balances];
    }

    /**
     * Handle wallet connection (called by main app)
     */
    public async handleWalletConnectionChange(account: Address | null): Promise<void> {
        console.log(`🔌 [INVENTORY-DEBUG] Wallet connection change - account: ${account ? 'connected' : 'disconnected'}, timestamp: ${new Date().toISOString()}`);
        if (account) {
            await this.handleWalletConnect(account);
        } else {
            this.handleWalletDisconnect();
        }
    }

    /**
     * Subscribe to balance updates
     */
    public onBalancesUpdated(callback: BalanceUpdateCallback): void {
        this.balanceUpdateCallbacks.push(callback);
    }

    /**
     * Unsubscribe from balance updates
     */
    public offBalancesUpdated(callback: BalanceUpdateCallback): void {
        const index = this.balanceUpdateCallbacks.indexOf(callback);
        if (index > -1) {
            this.balanceUpdateCallbacks.splice(index, 1);
        }
    }

    /**
     * Notify all subscribers that balances have been updated
     */
    private notifyBalancesUpdated(): void {
        console.log('📢 [DEBUG] Notifying balance update subscribers...', this.balanceUpdateCallbacks.length);
        this.balanceUpdateCallbacks.forEach(callback => {
            try {
                callback(this.state.balances);
            } catch (error) {
                console.error('Error in balance update callback:', error);
            }
        });
    }

    /**
     * Show background refresh indicator
     */
    private showBackgroundRefreshIndicator(): void {
        const indicator = document.getElementById('bg-refresh-indicator');
        if (indicator) {
            indicator.style.display = 'inline-block';
        }
    }

    /**
     * Hide background refresh indicator
     */
    private hideBackgroundRefreshIndicator(): void {
        const indicator = document.getElementById('bg-refresh-indicator');
        if (indicator) {
            indicator.style.display = 'none';
        }
    }

    /**
     * Cleanup component
     */
    public destroy(): void {
        this.stopPeriodicUpdates();
        this.balanceUpdateCallbacks = [];
    }
}
