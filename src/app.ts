import { type Address } from 'viem';

// Import services
import { WalletService } from './services/wallet-service.ts';
import { ContractService } from './services/contract-service.ts';
import { PriceService } from './services/price-service.ts';
import { CurvePriceService } from './services/curve-price-service.ts';
import { SwapService } from './services/swap-service.ts';
import { TransactionService, TransactionOperation } from './services/transaction-service.ts';
import { cacheService } from './services/cache-service.ts';

// Import components
import { NotificationManager } from './components/notification-manager.ts';
import { UnifiedExchangeComponent } from './components/unified-exchange-component.ts';
import { InventoryBarComponent } from './components/inventory-bar-component.ts';

// Import utilities
import { formatAddress } from './utils/format-utils.ts';
import { TransactionButtonUtils } from './utils/transaction-button-utils.ts';

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
    private curvePriceService: CurvePriceService;
    private swapService: SwapService;
    private transactionService: TransactionService;

    // Components
    private notificationManager: NotificationManager;
    private unifiedExchangeComponent: UnifiedExchangeComponent;
    private inventoryBarComponent: InventoryBarComponent;

    constructor() {
        // Initialize services with dependency injection
        this.walletService = new WalletService();
        this.contractService = new ContractService(this.walletService);
        this.priceService = new PriceService(this.contractService, this.walletService);
        this.curvePriceService = new CurvePriceService(this.walletService);
        this.swapService = new SwapService(this.walletService, this.contractService);
        this.transactionService = new TransactionService(
            this.walletService,
            this.contractService,
            this.priceService
        );

        // Initialize components
        this.notificationManager = new NotificationManager();

        const services = {
            walletService: this.walletService,
            contractService: this.contractService,
            priceService: this.priceService,
            curvePriceService: this.curvePriceService,
            transactionService: this.transactionService,
            swapService: this.swapService,
            notificationManager: this.notificationManager
        };

        // Create inventory bar component first (needed by exchange component)
        this.inventoryBarComponent = new InventoryBarComponent({
            walletService: this.walletService,
            contractService: this.contractService,
            priceService: this.priceService,
            notificationManager: this.notificationManager
        });

        // Create unified exchange component
        this.unifiedExchangeComponent = new UnifiedExchangeComponent({
            ...services,
            inventoryBar: this.inventoryBarComponent
        });

        this.setupServiceEventHandlers();

        // Expose to window for HTML onclick handlers
        (window as any).app = this;

        this.init();
    }

    private async init() {
        // Initialize dynamic date labels for chart
        this.initializeDynamicDates();

        // Show the exchange interface
        this.showExchangeInterface();

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

        // Initialize services for optimal route calculations
        if (!this.priceService.isInitialized()) {
            try {
                await this.priceService.initialize();
                console.log('✅ Price service initialized');

                // Warm cache with essential data for better responsiveness
                await cacheService.warmCache(this.contractService);
            } catch (error) {
                console.warn('Failed to initialize price service:', error);
            }
        }

        // Auto-register transaction buttons for enhanced UX
        TransactionButtonUtils.autoRegisterCommonButtons();
    }

    /**
     * Show the exchange interface elements
     */
    private showExchangeInterface(): void {
        const directionToggle = document.querySelector('.direction-toggle') as HTMLElement;
        const exchangeForm = document.getElementById('exchangeForm') as HTMLElement;

        if (directionToggle) {
            directionToggle.style.display = 'flex';
        }

        if (exchangeForm) {
            exchangeForm.style.display = 'block';
        }
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
                this.unifiedExchangeComponent.updateWalletConnection(true);
                this.inventoryBarComponent.handleWalletConnectionChange(account);
            },
            onDisconnect: () => {
                this.updateWalletUI(null);
                this.unifiedExchangeComponent.updateWalletConnection(false);
                this.inventoryBarComponent.handleWalletConnectionChange(null);
            }
        });

        // Transaction service event handlers
        this.transactionService.setEventHandlers({
            onTransactionStart: (operation: string) => {
                this.unifiedExchangeComponent.handleTransactionStart();
            },
            onTransactionSubmitted: (operation: string, hash: string) => {
                this.unifiedExchangeComponent.handleTransactionSubmitted(hash);
            },
            onTransactionSuccess: (operation: string, hash: string) => {
                this.unifiedExchangeComponent.handleTransactionSuccess(operation);
            },
            onTransactionError: (operation: string, error: Error) => {
                this.unifiedExchangeComponent.handleTransactionError(error);
            },
            onApprovalNeeded: (tokenSymbol: string) => {
                // Handled within the unified exchange component
            },
            onApprovalComplete: (tokenSymbol: string) => {
                // Handled within the unified exchange component
            }
        });
    }

    private updateWalletUI(account: Address | null) {
        const connectButton = document.getElementById('connectWallet') as HTMLButtonElement;

        if (account) {
            // When connected, show disconnect button and wallet info
            connectButton.textContent = 'Disconnect';
            connectButton.disabled = false;
            connectButton.style.display = 'unset';
            document.getElementById('walletInfo')!.style.display = 'unset';
            document.getElementById('walletAddress')!.textContent = formatAddress(account);
        } else {
            // When disconnected, show connect button and hide wallet info
            connectButton.textContent = 'Connect Wallet';
            connectButton.disabled = false;
            connectButton.style.display = 'unset';
            document.getElementById('walletInfo')!.style.display = 'none';
        }
    }

    // Public methods called from HTML
    async connectWallet() {
        const connectButton = document.getElementById('connectWallet') as HTMLButtonElement;
        const originalText = connectButton.textContent;

        try {
            // Check if wallet is already connected
            if (this.walletService.isConnected()) {
                // Set disconnecting state
                connectButton.textContent = 'Disconnecting...';
                connectButton.disabled = true;

                // Disconnect wallet
                this.walletService.disconnect();
                // UI updates are handled by event handlers
            } else {
                // Set connecting state
                connectButton.textContent = 'Connecting...';
                connectButton.disabled = true;

                await this.walletService.connect();
                // UI updates are handled by event handlers
            }
        } catch (error: any) {
            // Reset button state on error
            connectButton.textContent = originalText;
            connectButton.disabled = false;
            this.notificationManager.showError('exchange', error.message);
        }
    }

    async handleExchange(event: Event) {
        await this.unifiedExchangeComponent.handleSubmit(event);
    }

    /**
     * Demo transaction button UX - can be called from browser console
     * Usage: app.demoTransactionUX('exchangeButton')
     */
    async demoTransactionUX(buttonId: string = 'exchangeButton') {
        console.log(`🧪 Starting transaction UX demo for button: ${buttonId}`);
        await TransactionButtonUtils.demoTransactionFlow(buttonId);
    }

    /**
     * Get transaction button status - can be called from browser console
     * Usage: app.getTransactionStatus()
     */
    getTransactionStatus() {
        const active = TransactionButtonUtils.getActiveTransactions();
        const hasActive = TransactionButtonUtils.hasActiveTransaction();

        console.log('📊 Transaction Status:');
        console.log('  Has active transactions:', hasActive);
        console.log('  Active transactions:', active);

        return { hasActive, active };
    }
}

// Initialize app
new UUSDApp();
