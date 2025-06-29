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
import { SparklineComponent } from './components/sparkline-component.ts';

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
    private sparklineComponent: SparklineComponent | null = null;

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

        this.mintComponent = new MintComponent(services);
        this.redeemComponent = new RedeemComponent(services);

        this.setupServiceEventHandlers();

        // Expose to window for HTML onclick handlers
        (window as any).app = this;

        this.init();
    }

    private async init() {
        // Initialize components immediately for fast UX
        this.tabManager.initialize((tab) => this.handleTabChange(tab));

        // Only load UUSD price immediately - defer collateral options until needed
        this.loadUUSDPrice().catch(error => {
            console.warn('Failed to load UUSD price:', error);
        });
    }

    /**
     * Load and display current UUSD price with sparkline
     */
    private async loadUUSDPrice(): Promise<void> {
        try {
            const uusdPrice = await this.priceService.getCurrentUUSDPrice();
            this.updateUUSDPriceDisplay(uusdPrice);

            // Load and display price history sparkline
            this.loadPriceHistory();
        } catch (error: any) {
            console.warn('Failed to load UUSD price:', error);
            this.updateUUSDPriceDisplay('Unavailable');
        }
    }

    /**
     * Load and display price history sparkline
     */
    private async loadPriceHistory(): Promise<void> {
        try {
            const priceHistory = await this.priceService.getUUSDPriceHistory();
            this.initializeSparkline(priceHistory);
        } catch (error: any) {
            console.warn('Failed to load price history:', error);
            // Sparkline will show empty state
        }
    }

    /**
     * Initialize sparkline component with price data
     */
    private initializeSparkline(priceHistory: any[]): void {
        const sparklineContainer = document.getElementById('sparklineContainer');
        if (!sparklineContainer) throw new Error('Sparkline container not found');

        // Destroy existing sparkline if present
        if (this.sparklineComponent) {
            this.sparklineComponent.destroy();
        }

        // Create new sparkline
        this.sparklineComponent = new SparklineComponent(sparklineContainer, {
            width: 80,
            height: 20,
            lineColor: '#00d4aa',
            lineWidth: 1.5,
            fillColor: 'rgba(0, 212, 170, 0.1)'
        });

        // Update with price data
        this.sparklineComponent.updateData(priceHistory);

        // Add trend indicator
        this.updateTrendIndicator();
    }

    /**
     * Update trend indicator based on sparkline data
     */
    private updateTrendIndicator(): void {
        if (!this.sparklineComponent) return;

        const trend = this.sparklineComponent.getTrend();
        const priceChange = this.sparklineComponent.getPriceChange();

        const priceElement = document.getElementById('uusdPrice');
        if (!priceElement) return;

        // Remove existing trend classes
        priceElement.classList.remove('price-up', 'price-down', 'price-flat');

        // Add trend class and symbol
        let trendSymbol = '';
        let trendClass = '';

        if (trend === 'up') {
            trendSymbol = ' ↗';
            trendClass = 'price-up';
        } else if (trend === 'down') {
            trendSymbol = ' ↘';
            trendClass = 'price-down';
        } else {
            trendSymbol = ' →';
            trendClass = 'price-flat';
        }

        priceElement.classList.add(trendClass);

        // Add percentage change if significant
        if (Math.abs(priceChange) > 0.01) {
            const changeText = `${trendSymbol} ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`;

            let changeElement = document.getElementById('priceChange');
            if (!changeElement) {
                changeElement = document.createElement('span');
                changeElement.id = 'priceChange';
                changeElement.style.fontSize = '0.8em';
                changeElement.style.marginLeft = '8px';
                priceElement.appendChild(changeElement);
            }

            changeElement.textContent = changeText;
            changeElement.className = `price-change ${trendClass}`;
        }
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

    private setupServiceEventHandlers() {
        // Wallet service event handlers
        this.walletService.setEventHandlers({
            onConnect: (account: Address) => {
                this.updateWalletUI(account);
                this.tabManager.updateWalletConnection(true);
                this.mintComponent.updateWalletConnection(true);
                this.redeemComponent.updateWalletConnection(true);
                this.redeemComponent.checkForPendingRedemptions(account);
            },
            onDisconnect: () => {
                this.updateWalletUI(null);
                this.tabManager.updateWalletConnection(false);
                this.mintComponent.updateWalletConnection(false);
                this.redeemComponent.updateWalletConnection(false);
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
    async connectWallet() {
        const connectButton = document.getElementById('connectWallet') as HTMLButtonElement;
        const originalText = connectButton.textContent;

        try {
            // Set loading state
            connectButton.textContent = 'Connecting...';
            connectButton.disabled = true;

            await this.walletService.connect();
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
}

// Initialize app
new UUSDApp();
