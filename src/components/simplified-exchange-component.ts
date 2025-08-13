import { parseEther, formatEther, formatUnits, type Address } from 'viem';
import type { WalletService } from '../services/wallet-service.ts';
import type { ContractService, ProtocolSettings } from '../services/contract-service.ts';
import type { PriceService } from '../services/price-service.ts';
import type { CurvePriceService } from '../services/curve-price-service.ts';
import type { TransactionService } from '../services/transaction-service.ts';
import type { SwapService } from '../services/swap-service.ts';
import { TransactionStateService } from '../services/transaction-state-service.ts';
import { OptimalRouteService, type OptimalRouteResult, type ExchangeDirection } from '../services/optimal-route-service.ts';
import { LUSD_COLLATERAL } from '../contracts/constants.ts';
import type { NotificationManager } from './notification-manager.ts';
import type { InventoryBarComponent } from './inventory-bar-component.ts';
import { getMaxTokenBalance, hasAvailableBalance } from '../utils/balance-utils.ts';

interface SimplifiedExchangeServices {
    walletService: WalletService;
    contractService: ContractService;
    priceService: PriceService;
    curvePriceService: CurvePriceService;
    transactionService: TransactionService;
    swapService: SwapService;
    notificationManager: NotificationManager;
    inventoryBar: InventoryBarComponent;
}

/**
 * Simplified Exchange Component
 * Clean, minimal interface that automatically handles the best route
 */
export class SimplifiedExchangeComponent {
    private services: SimplifiedExchangeServices;
    private optimalRouteService: OptimalRouteService;
    private transactionStateService: TransactionStateService;
    private debounceTimer: any | null = null;

    // Simplified state
    private state = {
        direction: 'deposit' as ExchangeDirection,
        amount: '',
        useUbqDiscount: false,
        forceSwapOnly: false,
        redemptionsDisabled: false, // Track protocol redemption status separately
        protocolSettings: null as ProtocolSettings | null,
        routeResult: null as OptimalRouteResult | null,
        isCalculating: false
    };

    constructor(services: SimplifiedExchangeServices) {
        this.services = services;
        this.transactionStateService = TransactionStateService.getInstance();
        this.optimalRouteService = new OptimalRouteService(
            services.priceService,
            services.curvePriceService,
            services.contractService
        );

        this.init();
    }

    private async init() {
        await this.loadProtocolSettings();

        // ALWAYS check redemption status on init so state is correct from the start
        console.log('[INIT] Checking redemption status on startup...');
        await this.checkRedemptionStatus();

        this.registerTransactionButton();
        this.setupEventListeners();
        this.setupBalanceSubscription();

        this.render();

        // Periodically refresh protocol settings and redemption status (every 30 seconds)
        setInterval(async () => {
            await this.loadProtocolSettings();
            await this.checkRedemptionStatus();

            // Only re-render options if on withdraw view
            if (this.state.direction === 'withdraw') {
                this.renderOptions();
            }
        }, 30000);
    }

    /**
     * Load protocol settings and determine available options
     */
    private async loadProtocolSettings() {
        try {
            const settings = await this.services.contractService.getProtocolSettings(LUSD_COLLATERAL.index);
            this.state.protocolSettings = settings;
        } catch (error) {
            console.error('Failed to load protocol settings:', error);
        }
    }

    /**
     * Setup event listeners
     */
    private setupEventListeners() {
        // Wait for DOM
        setTimeout(() => {
            const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;
            const depositButton = document.getElementById('depositButton') as HTMLButtonElement;
            const withdrawButton = document.getElementById('withdrawButton') as HTMLButtonElement;
            const ubqDiscountCheckbox = document.getElementById('useUbqDiscount') as HTMLInputElement;
            const swapOnlyCheckbox = document.getElementById('forceSwapOnly') as HTMLInputElement;

            if (amountInput) {
                amountInput.addEventListener('input', () => this.handleAmountChange());
            }

            if (depositButton) {
                depositButton.addEventListener('click', () => this.switchDirection('deposit'));
            }

            if (withdrawButton) {
                withdrawButton.addEventListener('click', () => this.switchDirection('withdraw'));
            }

            if (ubqDiscountCheckbox) {
                ubqDiscountCheckbox.addEventListener('change', (e) => {
                    this.state.useUbqDiscount = (e.target as HTMLInputElement).checked;
                    this.calculateRoute();
                });
            }

            if (swapOnlyCheckbox) {
                swapOnlyCheckbox.addEventListener('change', (e) => {
                    // CRITICAL: Never allow user to change this when redemptions are disabled
                    if (this.state.redemptionsDisabled) {
                        console.warn('Redemptions disabled - ignoring user checkbox change');
                        e.preventDefault();
                        e.stopPropagation();
                        // Force checkbox back to checked state
                        swapOnlyCheckbox.checked = true;
                        return;
                    }

                    // Only allow changes when redemptions are enabled
                    this.state.forceSwapOnly = (e.target as HTMLInputElement).checked;
                    this.calculateRoute();
                });
            }
        }, 100);
    }

    /**
     * Handle amount input changes
     */
    private handleAmountChange() {
        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;
        this.state.amount = amountInput?.value || '';

        // Debounce calculation
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        this.debounceTimer = setTimeout(() => {
            this.calculateRoute();
        }, 300);
    }

    /**
     * Switch between buy and sell
     */
    private async switchDirection(direction: ExchangeDirection) {
        console.log('[SWITCH DIRECTION] Starting switch to:', direction);

        // Clear current state
        this.state.direction = direction;
        this.state.amount = '';
        this.state.routeResult = null;

        // Clear input
        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;
        if (amountInput) amountInput.value = '';

        // IMPORTANT: Never reset redemptionsDisabled - it's a protocol state, not a UI state!
        // Only reset forceSwapOnly for deposits (user preference)
        if (direction === 'deposit') {
            this.state.forceSwapOnly = false;
        }

        // For withdrawals, ensure checkbox is hidden if redemptions are disabled
        if (direction === 'withdraw' && this.state.redemptionsDisabled) {
            // Force the state
            this.state.forceSwapOnly = true;

            // Hide checkbox IMMEDIATELY
            const swapOnlyDiv = document.getElementById('swapOnlyOption');
            if (swapOnlyDiv) {
                swapOnlyDiv.style.display = 'none';
                swapOnlyDiv.style.visibility = 'hidden';
                console.log('[SWITCH DIRECTION] Redemptions disabled - hiding checkbox immediately');
            }
        }

        // Re-render UI
        this.render();

        // Auto-populate with max balance if available
        this.autoPopulateMaxBalance();
    }

    /**
     * Calculate the optimal route
     */
    private async calculateRoute() {
        const amount = this.state.amount;
        if (!amount || amount === '0') {
            this.state.routeResult = null;
            this.renderOutput();
            return;
        }

        this.state.isCalculating = true;

        try {
            const inputAmount = parseEther(amount);
            let routeResult: OptimalRouteResult;

            if (this.state.direction === 'deposit') {
                // For deposits, check if UBQ discount is available and user wants it
                const forceCollateralOnly = !this.state.useUbqDiscount;
                routeResult = await this.optimalRouteService.getOptimalDepositRoute(inputAmount, forceCollateralOnly);
            } else {
                // For withdrawals, ALWAYS use forceSwapOnly when redemptions are disabled
                const forceSwap = this.state.redemptionsDisabled || this.state.forceSwapOnly;
                console.log('[CALCULATE ROUTE] Withdraw route - forceSwap:', forceSwap, 'redemptionsDisabled:', this.state.redemptionsDisabled);
                routeResult = await this.optimalRouteService.getOptimalWithdrawRoute(inputAmount, forceSwap);
            }

            this.state.routeResult = routeResult;
        } catch (error) {
            console.error('Error calculating route:', error);
            this.state.routeResult = null;
        }

        this.state.isCalculating = false;
        this.renderOutput();
    }

    /**
     * Render the main UI
     */
    private render() {
        // Update direction buttons
        const depositButton = document.getElementById('depositButton');
        const withdrawButton = document.getElementById('withdrawButton');

        if (depositButton && withdrawButton) {
            depositButton.classList.toggle('active', this.state.direction === 'deposit');
            withdrawButton.classList.toggle('active', this.state.direction === 'withdraw');
        }

        // Update input label
        const amountLabel = document.getElementById('amountLabel');
        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;

        if (amountLabel) {
            amountLabel.textContent = this.state.direction === 'deposit' ? 'LUSD' : 'UUSD';
        }

        if (amountInput) {
            amountInput.placeholder = this.state.direction === 'deposit'
                ? 'Enter LUSD amount'
                : 'Enter UUSD amount';
        }

        // Show/hide options based on protocol state and direction
        this.renderOptions();
        this.renderOutput();
    }

    /**
     * Check redemption status and update state
     */
    private async checkRedemptionStatus() {
        console.log('[REDEMPTION CHECK] Starting redemption status check...');

        try {
            // Check if redemptions are allowed
            const testAmount = parseEther('1'); // Test with 1 UUSD
            console.log('[REDEMPTION CHECK] Calling calculateRedeemOutput with test amount:', testAmount.toString());

            const redeemResult = await this.services.priceService.calculateRedeemOutput({
                dollarAmount: testAmount,
                collateralIndex: LUSD_COLLATERAL.index
            });

            console.log('[REDEMPTION CHECK] Result from calculateRedeemOutput:', {
                isRedeemingAllowed: redeemResult.isRedeemingAllowed,
                raw: redeemResult
            });

            // Update redemption disabled state
            this.state.redemptionsDisabled = !redeemResult.isRedeemingAllowed;

            // Force swap-only if redemptions are disabled
            if (this.state.redemptionsDisabled) {
                this.state.forceSwapOnly = true;
                console.log('[REDEMPTION CHECK] Protocol redemptions DISABLED - forcing Curve swap only');

                // Immediately hide and disable the checkbox
                const swapOnlyDiv = document.getElementById('swapOnlyOption');
                const swapOnlyCheckbox = document.getElementById('forceSwapOnly') as HTMLInputElement;

                if (swapOnlyDiv) {
                    swapOnlyDiv.style.display = 'none';
                }

                if (swapOnlyCheckbox) {
                    swapOnlyCheckbox.checked = true;
                    swapOnlyCheckbox.disabled = true;
                }
            } else {
                // Only reset if redemptions are enabled
                this.state.redemptionsDisabled = false;
                this.state.forceSwapOnly = false;
                console.log('[REDEMPTION CHECK] Protocol redemptions ENABLED - user can choose route');
            }
        } catch (error) {
            console.error('[REDEMPTION CHECK] Error caught:', error);
            // On error, assume redemptions are disabled to be safe
            this.state.redemptionsDisabled = true;
            this.state.forceSwapOnly = true;

            // Hide checkbox on error too
            const swapOnlyDiv = document.getElementById('swapOnlyOption');
            if (swapOnlyDiv) {
                swapOnlyDiv.style.display = 'none';
            }
        }

        console.log('[REDEMPTION CHECK] Complete. Final State:', {
            redemptionsDisabled: this.state.redemptionsDisabled,
            forceSwapOnly: this.state.forceSwapOnly
        });
    }

    /**
     * Render options based on protocol state
     */
    private renderOptions() {
        console.log('[RENDER OPTIONS] Starting render with state:', {
            direction: this.state.direction,
            redemptionsDisabled: this.state.redemptionsDisabled,
            forceSwapOnly: this.state.forceSwapOnly
        });

        const ubqOptionDiv = document.getElementById('ubqDiscountOption');
        const swapOnlyDiv = document.getElementById('swapOnlyOption');
        const swapOnlyCheckbox = document.getElementById('forceSwapOnly') as HTMLInputElement;

        if (!this.state.protocolSettings) {
            // Hide all options if settings not loaded
            if (ubqOptionDiv) ubqOptionDiv.style.display = 'none';
            if (swapOnlyDiv) swapOnlyDiv.style.display = 'none';
            return;
        }

        if (this.state.direction === 'deposit') {
            // For deposits: Show UBQ discount option only if protocol is fractional (not 100% collateralized)
            if (ubqOptionDiv) {
                const showUbqOption = this.state.protocolSettings.isFractional;
                ubqOptionDiv.style.display = showUbqOption ? 'block' : 'none';
            }

            // Hide swap-only option for deposits
            if (swapOnlyDiv) {
                swapOnlyDiv.style.display = 'none';
            }
        } else {
            // For withdrawals: Check redemption status
            if (this.state.redemptionsDisabled) {
                // REDEMPTIONS DISABLED - HIDE EVERYTHING, NO USER CHOICE
                console.log('[RENDER OPTIONS] Redemptions disabled - hiding checkbox completely');

                if (swapOnlyDiv) {
                    swapOnlyDiv.style.display = 'none';
                    swapOnlyDiv.style.visibility = 'hidden'; // Extra safety
                }

                if (swapOnlyCheckbox) {
                    swapOnlyCheckbox.checked = true;
                    swapOnlyCheckbox.disabled = true;
                    // Remove any event listeners to prevent interaction
                    const newCheckbox = swapOnlyCheckbox.cloneNode(true) as HTMLInputElement;
                    swapOnlyCheckbox.parentNode?.replaceChild(newCheckbox, swapOnlyCheckbox);
                }
            } else {
                // REDEMPTIONS ENABLED - Show option for user choice
                console.log('[RENDER OPTIONS] Redemptions enabled - showing checkbox for user choice');

                if (swapOnlyDiv && swapOnlyCheckbox) {
                    swapOnlyDiv.style.display = 'block';
                    swapOnlyDiv.style.visibility = 'visible';
                    swapOnlyCheckbox.disabled = false;
                    swapOnlyCheckbox.checked = this.state.forceSwapOnly;

                    const label = swapOnlyDiv.querySelector('label[for="forceSwapOnly"]');
                    if (label) {
                        label.textContent = 'Use Curve swap only';
                    }
                }
            }

            // Hide UBQ option for withdrawals
            if (ubqOptionDiv) {
                ubqOptionDiv.style.display = 'none';
            }
        }

        console.log('[RENDER OPTIONS] Complete. DOM state:', {
            swapOnlyDisplay: swapOnlyDiv?.style.display,
            swapOnlyVisibility: swapOnlyDiv?.style.visibility,
            checkboxChecked: swapOnlyCheckbox?.checked,
            checkboxDisabled: swapOnlyCheckbox?.disabled
        });
    }

    /**
     * Render the output section
     */
    private renderOutput() {
        const outputSection = document.getElementById('exchangeOutput');
        const button = document.getElementById('exchangeButton') as HTMLButtonElement;

        if (!outputSection || !button) return;

        // Hide output if no route calculated
        if (!this.state.routeResult || !this.state.amount) {
            outputSection.style.display = 'none';
            button.textContent = 'Enter amount to continue';
            button.disabled = true;
            return;
        }

        // Show output
        outputSection.style.display = 'block';

        // Update expected output
        const expectedOutputEl = document.getElementById('expectedOutput');
        if (expectedOutputEl) {
            const outputToken = this.state.direction === 'deposit' ? 'UUSD' : 'LUSD';
            let outputText = `${formatEther(this.state.routeResult.expectedOutput)} ${outputToken}`;

            // Add UBQ if it's part of the transaction
            if (this.state.routeResult.isUbqOperation && this.state.routeResult.ubqAmount) {
                if (this.state.direction === 'withdraw') {
                    outputText += ` + ${formatEther(this.state.routeResult.ubqAmount)} UBQ`;
                }
            }

            expectedOutputEl.textContent = outputText;
        }

        // Update route type indicator
        const routeIndicator = document.getElementById('routeIndicator');
        if (routeIndicator) {
            const routeText = this.getRouteTypeText(this.state.routeResult.routeType);
            routeIndicator.textContent = routeText;
        }

        // Update button
        this.updateActionButton();
    }

    /**
     * Get human-readable route type text
     */
    private getRouteTypeText(routeType: string): string {
        switch (routeType) {
            case 'mint':
                return '🔨 Protocol Mint';
            case 'redeem':
                return '🔄 Protocol Redeem';
            case 'swap':
                return '🔀 Curve Swap';
            default:
                return '';
        }
    }

    /**
     * Update action button based on wallet state and approvals
     */
    private async updateActionButton() {
        const button = document.getElementById('exchangeButton') as HTMLButtonElement;
        if (!button || !this.state.routeResult) return;

        const account = this.services.walletService.getAccount();

        if (!account) {
            button.textContent = 'Connect wallet first';
            button.disabled = true;
            return;
        }

        if (!this.state.routeResult.isEnabled) {
            button.textContent = 'Route not available';
            button.disabled = true;
            return;
        }

        // Check approvals
        let needsApproval = false;
        let approvalToken = '';

        try {
            if (this.state.routeResult.routeType === 'mint') {
                const mintResult = await this.services.priceService.calculateMintOutput({
                    dollarAmount: this.state.routeResult.inputAmount,
                    collateralIndex: LUSD_COLLATERAL.index,
                    isForceCollateralOnly: !this.state.useUbqDiscount
                });

                const approvalStatus = await this.services.transactionService.getMintApprovalStatus(
                    LUSD_COLLATERAL,
                    account,
                    mintResult
                );
                needsApproval = approvalStatus.needsCollateralApproval || approvalStatus.needsGovernanceApproval;
                approvalToken = approvalStatus.needsCollateralApproval ? 'LUSD' : 'UBQ';
            } else if (this.state.routeResult.routeType === 'redeem') {
                const allowance = await this.services.transactionService.getRedeemApprovalStatus(
                    account,
                    this.state.routeResult.inputAmount
                );
                needsApproval = allowance.needsApproval;
                approvalToken = 'UUSD';
            } else if (this.state.routeResult.routeType === 'swap') {
                const fromToken = this.state.direction === 'deposit' ? 'LUSD' : 'UUSD';
                const tokenAddress = fromToken === 'LUSD'
                    ? '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0' as Address
                    : '0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103' as Address;
                const poolAddress = this.services.swapService.getPoolAddress();

                const allowance = await this.services.contractService.getAllowance(
                    tokenAddress,
                    account,
                    poolAddress
                );
                needsApproval = allowance < this.state.routeResult.inputAmount;
                approvalToken = fromToken;
            }
        } catch (error) {
            console.error('Error checking approvals:', error);
        }

        // Update button text
        if (needsApproval) {
            button.textContent = `Approve ${approvalToken}`;
        } else {
            const actionVerb = this.state.direction === 'deposit' ? 'Buy UUSD' : 'Sell UUSD';
            button.textContent = actionVerb;
        }

        button.disabled = false;
    }

    /**
     * Execute the transaction
     */
    async executeTransaction(): Promise<void> {
        this.transactionStateService.startTransaction('exchangeButton');

        if (!this.services.walletService.isConnected()) {
            this.transactionStateService.errorTransaction('exchangeButton', 'Wallet not connected', '❌ Connect Wallet');
            this.services.notificationManager.showError('exchange', 'Please connect wallet first');
            return;
        }

        if (!this.state.routeResult) {
            this.transactionStateService.errorTransaction('exchangeButton', 'No route calculated', '❌ Calculate Route');
            return;
        }

        try {
            const result = this.state.routeResult;

            switch (result.routeType) {
                case 'mint':
                    await this.services.transactionService.executeMint({
                        collateralIndex: LUSD_COLLATERAL.index,
                        dollarAmount: result.inputAmount,
                        isForceCollateralOnly: !this.state.useUbqDiscount
                    });
                    break;

                case 'redeem':
                    await this.services.transactionService.executeRedeem({
                        collateralIndex: LUSD_COLLATERAL.index,
                        dollarAmount: result.inputAmount
                    });
                    break;

                case 'swap':
                    const fromToken = this.state.direction === 'deposit' ? 'LUSD' as const : 'UUSD' as const;
                    const toToken = this.state.direction === 'deposit' ? 'UUSD' as const : 'LUSD' as const;

                    await this.services.swapService.executeSwap({
                        fromToken,
                        toToken,
                        amountIn: result.inputAmount,
                        minAmountOut: result.expectedOutput * 995n / 1000n, // 0.5% slippage
                        slippageTolerance: 0.005
                    });
                    break;
            }

            // Success - clear form
            this.handleTransactionSuccess();
        } catch (error: any) {
            this.handleTransactionError(error);
        }
    }

    /**
     * Handle transaction success
     */
    private handleTransactionSuccess() {
        const direction = this.state.direction === 'deposit' ? 'Bought' : 'Sold';
        this.transactionStateService.completeTransaction('exchangeButton', `✅ ${direction}!`);

        this.services.notificationManager.showSuccess(
            'exchange',
            `Successfully ${direction.toLowerCase()} ${this.state.amount} ${this.state.direction === 'deposit' ? 'LUSD' : 'UUSD'}!`
        );

        // Clear form
        this.state.amount = '';
        this.state.routeResult = null;
        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;
        if (amountInput) amountInput.value = '';
        this.renderOutput();
    }

    /**
     * Handle transaction error
     */
    private handleTransactionError(error: Error) {
        this.transactionStateService.errorTransaction('exchangeButton', error.message, '❌ Try Again');
        this.services.notificationManager.showError('exchange', error.message || 'Transaction failed');
        this.updateActionButton();
    }

    /**
     * Register transaction button
     */
    private registerTransactionButton() {
        setTimeout(() => {
            const button = document.getElementById('exchangeButton') as HTMLButtonElement;
            if (button) {
                console.log('Registering exchange button');

                // Set up direct click handler
                button.onclick = async () => {
                    console.log('Exchange button clicked');
                    await this.executeTransaction();
                };

                // Also register with transaction state service for state management
                this.transactionStateService.registerButton('exchangeButton', {
                    buttonElement: button,
                    originalText: 'Exchange',
                    pendingText: 'Processing...'
                });
            }
        }, 100);
    }

    /**
     * Setup balance subscription for auto-populate
     */
    private setupBalanceSubscription() {
        if (this.services.inventoryBar) {
            this.services.inventoryBar.onBalancesUpdated(() => {
                this.autoPopulateMaxBalance();
            });
        }
    }

    /**
     * Auto-populate with max balance
     */
    private autoPopulateMaxBalance() {
        if (!this.services.walletService.isConnected()) return;

        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;
        if (!amountInput || (amountInput.value && amountInput.value !== '0')) return;

        try {
            const tokenSymbol = this.state.direction === 'deposit' ? 'LUSD' : 'UUSD';
            if (hasAvailableBalance(this.services.inventoryBar, tokenSymbol)) {
                const maxBalance = getMaxTokenBalance(this.services.inventoryBar, tokenSymbol);
                amountInput.value = maxBalance;
                this.state.amount = maxBalance;
                this.calculateRoute();
            }
        } catch (error) {
            // Silent fail
        }
    }

    /**
     * Handle wallet connection changes
     */
    updateWalletConnection(isConnected: boolean) {
        if (isConnected) {
            this.loadProtocolSettings();
            this.calculateRoute();
        } else {
            this.state.routeResult = null;
            this.renderOutput();
        }
    }

    /**
     * Handle form submission
     */
    async handleSubmit(event: Event) {
        event.preventDefault();
        // Execute the transaction when form is submitted
        await this.executeTransaction();
    }

    // Transaction event handlers for app.ts integration
    handleTransactionStart() {
        this.transactionStateService.startTransaction('exchangeButton');
    }

    handleTransactionSubmitted(hash: string) {
        this.transactionStateService.updateTransactionHash('exchangeButton', hash);
    }
}
