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

    constructor() {
        // Initialize services with dependency injection
        this.walletService = new WalletService();
        this.contractService = new ContractService(this.walletService);
        this.priceService = new PriceService(this.contractService);
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

        // Load collateral options in background (not blocking UI)
        this.priceService.initialize().catch(error => {
            console.warn('Failed to load dynamic collateral options:', error);
        });
    }

    private setupServiceEventHandlers() {
        // Wallet service event handlers
        this.walletService.setEventHandlers({
            onConnect: (account: Address) => {
                this.updateWalletUI(account);
                this.mintComponent.updateWalletConnection(true);
                this.redeemComponent.updateWalletConnection(true);
                this.redeemComponent.checkForPendingRedemptions(account);
            },
            onDisconnect: () => {
                this.updateWalletUI(null);
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

    private handleTabChange(tab: 'mint' | 'redeem') {
        // Clear notifications when switching tabs
        this.notificationManager.clearNotifications('mint');
        this.notificationManager.clearNotifications('redeem');
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
        try {
            await this.walletService.connect();
            // UI updates are handled by event handlers
        } catch (error: any) {
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
