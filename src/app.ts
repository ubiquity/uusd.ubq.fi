import { type Address } from 'viem';

// Import services
import { WalletService } from './services/wallet-service.ts';
import { ContractService } from './services/contract-service.ts';
import { PriceService } from './services/price-service.ts';
import { TransactionService, TransactionOperation } from './services/transaction-service.ts';

// Import components
import { NotificationManager } from './components/notification-manager.ts';
import { TabManager } from './components/tab-manager.ts';
import { MintComponent } from './components/mint-component.ts';
import { RedeemComponent } from './components/redeem-component.ts';
import { InventoryBarComponent } from './components/inventory-bar-component.ts';

// Import utilities
import { formatAddress } from './utils/format-utils.ts';

declare global {
    interface Window {
        ethereum?: any;
    }
}

/**
 * Main Application Class - Lightweight Coordinator
 * Orchestrates components and manages high-level application state
 */
class UUSDApp {
    // Services
    private walletService: WalletService;
    private contractService: ContractService;
    private priceService: PriceService;
    private transactionService: TransactionService;

    // Components
    private notificationManager: NotificationManager;
    private tabManager: TabManager;
    private mintComponent: MintComponent;
    private redeemComponent: RedeemComponent;
    private inventoryBarComponent: InventoryBarComponent;

    constructor() {
        // Initialize services with dependency injection
        this.walletService = new WalletService();
        this.contractService = new ContractService(this.walletService);
        this.priceService = new PriceService(this.contractService, this.walletService);
        this.transactionService = new TransactionService(
            this.walletService,
            this.contractService,
            this.priceService
        );

        // Initialize components
        this.notificationManager = new NotificationManager();
        this.tabManager = new TabManager();

        const services = {
            walletService: this.walletService,
            contractService: this.contractService,
            priceService: this.priceService,
            transactionService: this.transactionService,
            notificationManager: this.notificationManager
        };

        // Create inventory bar component first (needed by mint/redeem components)
        this.inventoryBarComponent = new InventoryBarComponent(services);

        // Create mint/redeem components with inventory bar reference
        this.mintComponent = new MintComponent({
            ...services,
            inventoryBar: this.inventoryBarComponent
        });
        this.redeemComponent = new RedeemComponent({
            ...services,
            inventoryBar: this.inventoryBarComponent
        });

        // Register components with tab manager for auto-population
        this.tabManager.setComponents(this.mintComponent, this.redeemComponent);

        this.setupServiceEventHandlers();

        // Expose to window for HTML onclick handlers
        (window as any).app = this;

        this.init();
    }

    private async init() {
        // Initialize components immediately for fast UX
        this.tabManager.initialize((tab) => this.handleTabChange(tab));

        // Initialize dynamic date labels for chart
        this.initializeDynamicDates();

        // RENDER CACHED SPARKLINE IMMEDIATELY (synchronous)
        this.renderCachedSparkline();

        // Load UUSD price (separate from sparkline)
        this.loadUUSDPrice().catch(error => {
            console.warn('Failed to load UUSD price:', error);
        });

        // Load sparkline updates in parallel (separate from price)
        this.loadRealPriceHistory().catch(error => {
            console.warn('Failed to load price history:', error);
        });

        // Attempt auto-reconnect if wallet was previously connected
        this.attemptAutoReconnect();
    }

    /**
     * Load and display current UUSD price ONLY
     */
    private async loadUUSDPrice(): Promise<void> {
        try {
            const uusdPrice = await this.priceService.getCurrentUUSDPrice();
            this.updateUUSDPriceDisplay(uusdPrice);
        } catch (error: any) {
            console.warn('Failed to load UUSD price:', error);
            this.updateUUSDPriceDisplay('Unavailable');
        }
    }

    /**
     * Render cached sparkline immediately (synchronous)
     */
    private renderCachedSparkline(): void {
        try {
            const cachedHistory = this.priceService.getCachedUUSDPriceHistory();
            if (cachedHistory.length > 0) {
                console.log('⚡ Immediate sparkline render with', cachedHistory.length, 'cached points');
                this.generateRealSparkline(cachedHistory);
            }
        } catch (error: any) {
            // Ignore cache errors for immediate render
            console.warn('Could not render cached sparkline:', error);
        }
    }

    /**
     * Load real price history and generate dynamic sparkline
     * Uses "render-first, update-later" pattern for optimal UX
     */
    private async loadRealPriceHistory(): Promise<void> {
        try {
            // Get current cached state to compare
            const cachedHistory = this.priceService.getCachedUUSDPriceHistory();

            // STEP 2: Fetch fresh data and update if different
            const freshHistory = await this.priceService.getUUSDPriceHistory();
            console.log('📊 Fresh price history loaded:', freshHistory.length, 'points');

            // Only re-render if we got more/different data
            if (freshHistory.length > cachedHistory.length ||
                (freshHistory.length > 0 && cachedHistory.length === 0)) {
                console.log('🔄 Updating with fresh data');
                this.generateRealSparkline(freshHistory);
            }
        } catch (error: any) {
            console.warn('Failed to load price history:', error);
        }
    }

    /**
     * Generate real sparkline from actual price data
     */
    private generateRealSparkline(priceHistory: any[]): void {
        const chartElement = document.querySelector('.sparkline-chart') as HTMLElement;
        const strokeElement = document.querySelector('.sparkline-stroke') as HTMLElement;

        if (!chartElement || !strokeElement || priceHistory.length === 0) return;

        // Convert BigInt prices to numbers for Math operations
        const prices = priceHistory.map(point => {
            // Handle both BigInt and number types
            if (typeof point.price === 'bigint') {
                return Number(point.price) / 1000000; // Convert from 6-decimal precision to USD
            }
            return typeof point.price === 'number' ? point.price : parseFloat(point.price);
        });

        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice;

        // Map prices to chart coordinates based on $0.99-$1.01 range
        const chartMinPrice = 0.99;
        const chartMaxPrice = 1.01;
        const chartRange = chartMaxPrice - chartMinPrice;

        // Create polygon points for the sparkline
        const points: string[] = [];

        prices.forEach((price, index) => {
            const x = (index / (prices.length - 1)) * 100; // 0-100%

            // Map price to chart position: $0.99 = 80%, $1.01 = 20%
            const normalizedPrice = (price - chartMinPrice) / chartRange;
            const y = 80 - (normalizedPrice * 60); // Map to 80%-20% (inverted)

            points.push(`${x}% ${y}%`);
        });

        // Add bottom corners for fill area
        points.push('100% 100%', '0% 100%');

        // Create stroke path (without bottom fill)
        const strokePath = [...points.slice(0, -2)]; // Remove bottom corners
        strokePath.push(...points.slice(0, -2).reverse().map(point => {
            const [x, y] = point.split(' ');
            const yNum = parseFloat(y.replace('%', ''));
            return `${x} ${yNum + 0.1}%`; // Add minimal thickness for single-pixel line
        }));

        // Apply to CSS clip-path
        const clipPath = `polygon(${points.join(', ')})`;
        const strokeClipPath = `polygon(${strokePath.join(', ')})`;

        chartElement.style.clipPath = clipPath;
        strokeElement.style.clipPath = strokeClipPath;

        // Add "ready" class to trigger fade-in animation
        chartElement.classList.add('ready');
        strokeElement.classList.add('ready');

        console.log('📈 Dynamic sparkline generated with', points.length - 2, 'data points');
        console.log('💰 Actual price range: $' + minPrice.toFixed(6), '→ $' + maxPrice.toFixed(6));
        console.log('📊 Chart mapping: $0.99 → 80%, $1.01 → 20%');
        console.log('📍 First few points:', points.slice(0, 3));
    }

    /**
     * Update UUSD price display in the UI
     */
    private updateUUSDPriceDisplay(price: string): void {
        const priceElement = document.getElementById('uusdPrice');
        if (priceElement) {
            priceElement.textContent = price;
        }
    }

    /**
     * Initialize dynamic date labels for the last 7 days
     */
    private initializeDynamicDates(): void {
        const dateContainer = document.getElementById('dynamic-dates');
        if (!dateContainer) return;

        // Get last 7 days including today
        const dates: string[] = [];
        const today = new Date();

        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);

            // Format as "Mon DD"
            const month = date.toLocaleDateString('en-US', { month: 'short' });
            const day = date.getDate();

            dates.push(`${month} ${day}`);
        }

        // Clear existing content and add dynamic dates
        dateContainer.innerHTML = '';
        dates.forEach(dateStr => {
            const span = document.createElement('span');
            span.className = 'date-label';
            span.textContent = dateStr;
            dateContainer.appendChild(span);
        });
    }

    private setupServiceEventHandlers() {
        // Wallet service event handlers
        this.walletService.setEventHandlers({
            onConnect: (account: Address) => {
                this.updateWalletUI(account);
                this.tabManager.updateWalletConnection(true);
                this.mintComponent.updateWalletConnection(true);
                this.redeemComponent.updateWalletConnection(true);
                this.redeemComponent.checkForPendingRedemptions(account);
                this.inventoryBarComponent.handleWalletConnectionChange(account);
            },
            onDisconnect: () => {
                this.updateWalletUI(null);
                this.tabManager.updateWalletConnection(false);
                this.mintComponent.updateWalletConnection(false);
                this.redeemComponent.updateWalletConnection(false);
                this.inventoryBarComponent.handleWalletConnectionChange(null);
            },
            onAccountChanged: (account: Address | null) => {
                if (account) {
                    this.updateWalletUI(account);
                    this.mintComponent.updateWalletConnection(true);
                    this.redeemComponent.updateWalletConnection(true);
                    this.redeemComponent.checkForPendingRedemptions(account);
                    this.inventoryBarComponent.handleWalletConnectionChange(account);
                    this.notificationManager.showSuccess('mint', 'Wallet account changed');
                } else {
                    this.updateWalletUI(null);
                    this.tabManager.updateWalletConnection(false);
                    this.mintComponent.updateWalletConnection(false);
                    this.redeemComponent.updateWalletConnection(false);
                    this.inventoryBarComponent.handleWalletConnectionChange(null);
                }
            },
            onChainChanged: (chainId: string) => {
                this.notificationManager.showError('mint', 'Network changed. Page will reload...');
                // The wallet service already handles the reload
            }
        });

        // Transaction service event handlers
        this.transactionService.setEventHandlers({
            onTransactionStart: (operation: string) => {
                if (operation === TransactionOperation.MINT) {
                    this.mintComponent.handleTransactionStart();
                } else {
                    this.redeemComponent.handleTransactionStart();
                }
            },
            onTransactionSuccess: (operation: string, hash: string) => {
                if (operation === TransactionOperation.MINT) {
                    this.mintComponent.handleTransactionSuccess();
                } else {
                    this.redeemComponent.handleTransactionSuccess(operation);
                }
            },
            onTransactionError: (operation: string, error: Error) => {
                if (operation === TransactionOperation.MINT) {
                    this.mintComponent.handleTransactionError(error);
                } else {
                    this.redeemComponent.handleTransactionError(error);
                }
            },
            onApprovalNeeded: (tokenSymbol: string) => {
                const currentTab = this.tabManager.getCurrentTab();
                if (currentTab === 'mint') {
                    this.mintComponent.handleApprovalNeeded(tokenSymbol);
                } else {
                    this.redeemComponent.handleApprovalNeeded(tokenSymbol);
                }
            },
            onApprovalComplete: (tokenSymbol: string) => {
                const currentTab = this.tabManager.getCurrentTab();
                if (currentTab === 'mint') {
                    this.mintComponent.handleApprovalComplete();
                } else {
                    this.redeemComponent.handleApprovalComplete();
                }
            }
        });
    }

    private async handleTabChange(tab: 'mint' | 'redeem') {
        // Clear notifications when switching tabs
        this.notificationManager.clearNotifications('mint');
        this.notificationManager.clearNotifications('redeem');

        // Lazy load collateral options when user first accesses mint/redeem
        if (!this.priceService.isInitialized()) {
            console.log(`🔄 User accessed ${tab} tab, loading collateral options...`);
            try {
                await this.priceService.initialize();
                console.log('✅ Collateral options loaded');
            } catch (error) {
                console.warn('Failed to load collateral options:', error);
                this.notificationManager.showError(tab, 'Failed to load collateral options. Please refresh the page.');
            }
        }
    }

    private updateWalletUI(account: Address | null) {
        if (account) {
            document.getElementById('connectWallet')!.style.display = 'none';
            document.getElementById('walletInfo')!.style.display = 'block';
            document.getElementById('walletAddress')!.textContent = formatAddress(account);
        } else {
            document.getElementById('connectWallet')!.style.display = 'block';
            document.getElementById('walletInfo')!.style.display = 'none';
        }
    }

    // Public methods called from HTML
    async connectWallet(forceAccountSelection = false) {
        const connectButton = document.getElementById('connectWallet') as HTMLButtonElement;
        const originalText = connectButton.textContent;

        try {
            // Set loading state
            connectButton.textContent = 'Connecting...';
            connectButton.disabled = true;

            await this.walletService.connect(forceAccountSelection);
            // UI updates are handled by event handlers
        } catch (error: any) {
            // Reset button state on error
            connectButton.textContent = originalText;
            connectButton.disabled = false;
            this.notificationManager.showError('mint', error.message);
        }
    }

    switchTab(tab: 'mint' | 'redeem') {
        this.tabManager.switchTab(tab);
    }

    async handleMint(event: Event) {
        await this.mintComponent.handleSubmit(event);
    }

    async handleRedeem(event: Event) {
        await this.redeemComponent.handleSubmit(event);
    }

    /**
     * Attempt to auto-reconnect wallet if previously connected
     */
    private async attemptAutoReconnect(): Promise<void> {
        try {
            const storedAccount = await this.walletService.checkStoredConnection();
            if (storedAccount) {
                console.log('🔌 Auto-reconnecting to previously connected wallet...');
                // Update UI to show connecting state
                const connectButton = document.getElementById('connectWallet') as HTMLButtonElement;
                if (connectButton) {
                    connectButton.textContent = 'Reconnecting...';
                    connectButton.disabled = true;
                }
            }
        } catch (error) {
            console.warn('Auto-reconnect failed:', error);
            // Reset UI state on failure
            const connectButton = document.getElementById('connectWallet') as HTMLButtonElement;
            if (connectButton) {
                connectButton.textContent = 'Connect Wallet';
                connectButton.disabled = false;
            }
        }
    }
}

// Initialize app
new UUSDApp();
