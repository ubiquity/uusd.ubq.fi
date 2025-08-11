import { parseEther, formatEther, formatUnits, type Address } from 'viem';
import type { WalletService } from '../services/wallet-service.ts';
import type { ContractService } from '../services/contract-service.ts';
import type { PriceService } from '../services/price-service.ts';
import type { CurvePriceService } from '../services/curve-price-service.ts';
import type { TransactionService } from '../services/transaction-service.ts';
import type { SwapService } from '../services/swap-service.ts';
import { TransactionStateService } from '../services/transaction-state-service.ts';
import { TransactionButtonUtils } from '../utils/transaction-button-utils.ts';
import { OptimalRouteService, type OptimalRouteResult, type ExchangeDirection } from '../services/optimal-route-service.ts';
import { LUSD_COLLATERAL } from '../contracts/constants.ts';
import type { NotificationManager } from './notification-manager.ts';
import type { InventoryBarComponent } from './inventory-bar-component.ts';
import { OracleStatusComponent } from './oracle-status-component.ts';
import { analyzeOracleError } from '../utils/oracle-utils.ts';
import { getMaxTokenBalance, hasAvailableBalance } from '../utils/balance-utils.ts';

interface UnifiedExchangeServices {
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
 * Unified Exchange Component
 * Handles both deposit (LUSD → UUSD) and withdraw (UUSD → LUSD) operations
 * Automatically selects the optimal route (mint/redeem vs swap)
 */
export class UnifiedExchangeComponent {
    private services: UnifiedExchangeServices;
    private optimalRouteService: OptimalRouteService;
    private debounceTimer: any | null = null;
    private currentDirection: ExchangeDirection = 'deposit';
    private transactionStateService: TransactionStateService;

    constructor(services: UnifiedExchangeServices) {
        this.services = services;
        this.transactionStateService = TransactionStateService.getInstance();
        this.optimalRouteService = new OptimalRouteService(
            services.priceService,
            services.curvePriceService,
            services.contractService
        );
        this.setupBalanceSubscription();
        this.registerTransactionButton();
        this.setupEventListeners();
    }

    /**
     * Register the exchange button with transaction state service
     */
    private registerTransactionButton(): void {
        // Wait for DOM to be ready
        setTimeout(() => {
            const button = document.getElementById('exchangeButton') as HTMLButtonElement;
            if (button) {
                this.transactionStateService.registerButton('exchangeButton', {
                    buttonElement: button,
                    originalText: button.textContent || 'Exchange',
                    pendingText: 'Processing...',
                    onTransactionClick: () => this.executeTransaction()
                });
            }
        }, 100);
    }

    /**
     * Execute the exchange transaction
     */
    private async executeTransaction(): Promise<void> {
        if (!this.services.walletService.isConnected()) {
            this.services.notificationManager.showError('exchange', 'Please connect wallet first');
            return;
        }

        try {
            const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;

            if (!amountInput?.value) {
                this.services.notificationManager.showError('exchange', 'Please enter a valid amount');
                return;
            }

            const amount = parseEther(amountInput.value);

            // Calculate optimal route
            let routeResult: OptimalRouteResult;
            if (this.currentDirection === 'deposit') {
                routeResult = await this.optimalRouteService.getOptimalDepositRoute(amount);
            } else {
                routeResult = await this.optimalRouteService.getOptimalWithdrawRoute(amount);
            }

            // Execute the optimal route
            await this.executeOptimalRoute(routeResult);

        } catch (error: any) {
            console.error('Exchange transaction failed:', error);
            // Error is handled by the transaction handlers
        }
    }

    /**
     * Setup event listeners for the unified form
     */
    private setupEventListeners(): void {
        // Wait for DOM to be ready
        setTimeout(() => {
            const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;
            const depositButton = document.getElementById('depositButton') as HTMLButtonElement;
            const withdrawButton = document.getElementById('withdrawButton') as HTMLButtonElement;
            const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;
            const redeemLusdOnly = document.getElementById('redeemLusdOnly') as HTMLInputElement;

            console.log('🔧 Setting up event listeners:');
            console.log('  amountInput:', amountInput ? `Found (${amountInput.tagName})` : 'NOT FOUND');
            console.log('  depositButton:', depositButton ? `Found (${depositButton.tagName})` : 'NOT FOUND');
            console.log('  withdrawButton:', withdrawButton ? `Found (${withdrawButton.tagName})` : 'NOT FOUND');
            console.log('  forceCollateralOnly:', forceCollateralOnly ? `Found (${forceCollateralOnly.tagName})` : 'NOT FOUND');
            console.log('  redeemLusdOnly:', redeemLusdOnly ? `Found (${redeemLusdOnly.tagName})` : 'NOT FOUND');

            if (amountInput) {
                // Try multiple event types
                amountInput.addEventListener('input', () => {
                    console.log('📝 INPUT event triggered');
                    this.updateOutput();
                });
                amountInput.addEventListener('keyup', () => {
                    console.log('⌨️ KEYUP event triggered');
                    this.updateOutput();
                });
                amountInput.addEventListener('change', () => {
                    console.log('🔄 CHANGE event triggered');
                    this.updateOutput();
                });
                console.log('✅ Event listeners added to amountInput');
            } else {
                console.error('❌ amountInput not found!');
            }

            if (forceCollateralOnly) {
                forceCollateralOnly.addEventListener('change', () => {
                    console.log('☑️ Mint checkbox change event triggered');
                    this.updateOutput();
                });
            }

            if (redeemLusdOnly) {
                redeemLusdOnly.addEventListener('change', () => {
                    console.log('☑️ Redeem checkbox change event triggered');
                    this.updateOutput();
                });
            }

            if (depositButton) {
                depositButton.addEventListener('click', () => this.switchDirection('deposit'));
            }
            if (withdrawButton) {
                withdrawButton.addEventListener('click', () => this.switchDirection('withdraw'));
            }
        }, 100);
    }

    /**
     * Switch between deposit and withdraw directions
     */
    private switchDirection(direction: ExchangeDirection): void {
        this.currentDirection = direction;

        // Update UI state
        const depositButton = document.getElementById('depositButton') as HTMLButtonElement;
        const withdrawButton = document.getElementById('withdrawButton') as HTMLButtonElement;
        const amountLabel = document.getElementById('amountLabel') as HTMLLabelElement;
        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;

        if (depositButton && withdrawButton) {
            depositButton.classList.toggle('active', direction === 'deposit');
            withdrawButton.classList.toggle('active', direction === 'withdraw');
        }

        if (amountLabel) {
            amountLabel.textContent = direction === 'deposit' ? 'LUSD' : 'UUSD';
        }

        if (amountInput) {
            amountInput.placeholder = direction === 'deposit' ? 'Enter LUSD amount' : 'Enter UUSD amount';
        }

        // Clear form and recalculate
        this.clearForm();
        this.autoPopulateWithMaxBalance();
        this.updateOutput();
    }

    /**
     * Update exchange output with optimal route calculation
     */
    async updateOutput(): Promise<void> {
        console.log('🔍 updateOutput called');

        // Clear existing timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Debounce the calculation
        this.debounceTimer = setTimeout(async () => {
            console.log('⏰ Debounce timer triggered, calling performCalculation');
            await this.performCalculation();
        }, 300);
    }

    /**
     * Perform the optimal route calculation
     */
    private async performCalculation(): Promise<void> {
        try {
            const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;
            const exchangeOutput = document.getElementById('exchangeOutput');
            const exchangeButton = document.getElementById('exchangeButton') as HTMLButtonElement;
            const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;
            const redeemLusdOnly = document.getElementById('redeemLusdOnly') as HTMLInputElement;

            if (!amountInput || !exchangeOutput || !exchangeButton) {
                return;
            }

            const amount = amountInput.value;

            if (!amount || amount === '0') {
                exchangeOutput.style.display = 'none';
                exchangeButton.textContent = 'Enter amount to continue';
                exchangeButton.disabled = true;
                this.updateOptionsVisibility(false);
                return;
            }

            exchangeOutput.style.display = 'block';

            const inputAmount = parseEther(amount);

            // Calculate optimal route
            let routeResult: OptimalRouteResult;
            console.log('🔍 Current direction:', this.currentDirection);
            if (this.currentDirection === 'deposit') {
                console.log('📈 Calling getOptimalDepositRoute');
                const isForceCollateralOnly = forceCollateralOnly?.checked || false;
                routeResult = await this.optimalRouteService.getOptimalDepositRoute(inputAmount, isForceCollateralOnly);
            } else {
                console.log('📉 Calling getOptimalWithdrawRoute');
                const isLusdOnlyRedemption = redeemLusdOnly?.checked || false;
                routeResult = await this.optimalRouteService.getOptimalWithdrawRoute(inputAmount, isLusdOnlyRedemption);
            }

            console.log('📊 Route result:', routeResult);

            // Update UI with route information
            await this.updateRouteDisplay(routeResult);

            // Show appropriate options based on direction (mint options for deposits, redeem options for withdrawals)
            this.updateOptionsVisibility(true);

            // Update button based on route and wallet connection
            if (this.services.walletService.isConnected()) {
                await this.updateActionButton(routeResult);
            }

        } catch (error) {
            console.error('Error calculating optimal route:', error);
            this.showCalculationError();
        }
    }

    /**
     * Update the route display in the UI
     */
    private async updateRouteDisplay(result: OptimalRouteResult): Promise<void> {
        const routeTypeElement = document.getElementById('routeType');
        const expectedOutputElement = document.getElementById('expectedOutput');
        const marketPriceElement = document.getElementById('marketPrice');
        const savingsElement = document.getElementById('savingsAmount');
        const routeReasonElement = document.getElementById('routeReason');
        const routeWarningElement = document.getElementById('routeWarning');

        // Route type and action
        // if (routeTypeElement) {
        //     let actionText = '';
        //     switch (result.routeType) {
        //         case 'mint':
        //             actionText = '🔨 Minting';
        //             break;
        //         case 'redeem':
        //             actionText = '🔄 Redeeming';
        //             break;
        //         case 'swap':
        //             actionText = '🔀 Swapping';
        //             break;
        //     }
        //     routeTypeElement.textContent = actionText;
        // }

        // Expected output with UBQ amounts when applicable
        if (expectedOutputElement) {
            const outputToken = result.direction === 'deposit' ? 'UUSD' : 'LUSD';
            let outputText = `${formatEther(result.expectedOutput)} ${outputToken}`;

            // Add UBQ amounts when it's a UBQ operation
            if (result.isUbqOperation && result.ubqAmount) {
                if (result.direction === 'deposit') {
                    // For minting, show UBQ needed as input
                } else {
                    // For redeeming, show UBQ received as output
                    outputText += ` + ${formatEther(result.ubqAmount)} UBQ`;
                }
            }

            expectedOutputElement.textContent = outputText;
        }

        // Update UBQ amount display field for deposits
        const ubqAmountDisplay = document.getElementById('ubqAmountDisplay') as HTMLInputElement;
        const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;

        if (ubqAmountDisplay && result.direction === 'deposit') {
            if (result.isUbqOperation && result.ubqAmount && !forceCollateralOnly?.checked) {
                // Show required UBQ amount
                ubqAmountDisplay.value = formatEther(result.ubqAmount);
                ubqAmountDisplay.style.opacity = '1';
            } else {
                // Clear UBQ amount when not using UBQ
                ubqAmountDisplay.value = '0';
                ubqAmountDisplay.style.opacity = '0.5';
            }
        }

        // Market price
        if (marketPriceElement) {
            marketPriceElement.textContent = `$${formatUnits(result.marketPrice, 6)}`;
        }

        // Savings display
        // if (savingsElement) {
            // if (result.savings.percentage > 0) {
                // savingsElement.textContent = `Save ${result.savings.percentage.toFixed(2)}% (${formatEther(result.savings.amount)} tokens)`;
                // savingsElement.style.display = 'block';
                // savingsElement.className = 'savings-positive';
            // } else {
                // savingsElement.style.display = 'none';
            // }
        // }

        // Route reason
        if (routeReasonElement) {
            routeReasonElement.textContent = result.reason;
        }

        // Warning for disabled routes
        if (routeWarningElement) {
            if (!result.isEnabled && result.disabledReason) {
                routeWarningElement.textContent = result.disabledReason;
                routeWarningElement.style.display = 'block';
            } else {
                routeWarningElement.style.display = 'none';
            }
        }
    }

    /**
     * Update the action button based on the optimal route
     */
    private async updateActionButton(result: OptimalRouteResult): Promise<void> {
        const button = document.getElementById('exchangeButton') as HTMLButtonElement;
        const account = this.services.walletService.getAccount();

        if (!account) {
            button.textContent = 'Connect wallet first';
            button.disabled = true;
            return;
        }

        if (!result.isEnabled) {
            button.textContent = 'Action Disabled';
            button.disabled = true;
            return;
        }

        let needsApproval = false;
        let approvalTokenSymbol = '';

        // Check if approvals are needed based on route type
        if (result.routeType === 'mint') {
            // For mint operations, we need to calculate the actual mint result to check approvals
            const mintResult = await this.services.priceService.calculateMintOutput({
                dollarAmount: result.inputAmount,
                collateralIndex: LUSD_COLLATERAL.index,
                isForceCollateralOnly: false
            });

            const approvalStatus = await this.services.transactionService.getMintApprovalStatus(
                LUSD_COLLATERAL,
                account,
                mintResult
            );
            needsApproval = approvalStatus.needsCollateralApproval || approvalStatus.needsGovernanceApproval;
            approvalTokenSymbol = approvalStatus.needsCollateralApproval ? 'LUSD' : 'UBQ';
        } else if (result.routeType === 'redeem') {
            const allowance = await this.services.transactionService.getRedeemApprovalStatus(account, result.inputAmount);
            needsApproval = allowance.needsApproval;
            approvalTokenSymbol = 'UUSD';
        } else if (result.routeType === 'swap') {
            const fromToken = result.direction === 'deposit' ? 'LUSD' : 'UUSD';
            const tokenAddress = fromToken === 'LUSD'
                ? '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0' as Address
                : '0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103' as Address;
            const poolAddress = this.services.swapService.getPoolAddress();

            const allowance = await this.services.contractService.getAllowance(tokenAddress, account, poolAddress);
            needsApproval = allowance < result.inputAmount;
            approvalTokenSymbol = fromToken;
        }

        // Update button text
        if (needsApproval) {
            button.textContent = `Approve ${approvalTokenSymbol}`;
        } else {
            const actionVerb = result.direction === 'deposit' ? 'Deposit' : 'Withdraw';
            button.textContent = `${actionVerb} (${result.routeType})`;
        }

        button.disabled = false;
    }

    /**
     * Handle form submission - prevent default, let button handle transaction
     */
    async handleSubmit(event: Event): Promise<void> {
        event.preventDefault();
        // Form submission is now handled by button click through transaction state service
        // This prevents double execution
    }

    /**
     * Execute the optimal route transaction
     */
    private async executeOptimalRoute(result: OptimalRouteResult): Promise<void> {
        const account = this.services.walletService.getAccount()!;
        const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;
        const redeemLusdOnly = document.getElementById('redeemLusdOnly') as HTMLInputElement;

        switch (result.routeType) {
            case 'mint':
                await this.services.transactionService.executeMint({
                    collateralIndex: LUSD_COLLATERAL.index,
                    dollarAmount: result.inputAmount,
                    isForceCollateralOnly: forceCollateralOnly?.checked || false
                });
                break;

            case 'redeem':
                // For redemption, we need to handle the UBQ selection
                // Note: The transaction service should handle the UBQ redemption preference
                // but for now we pass the standard redeem parameters
                await this.services.transactionService.executeRedeem({
                    collateralIndex: LUSD_COLLATERAL.index,
                    dollarAmount: result.inputAmount,
                    // Future enhancement: pass isLusdOnlyRedemption flag when transaction service supports it
                    // isLusdOnlyRedemption: redeemLusdOnly?.checked || false
                });
                break;

            case 'swap':
                const fromToken = result.direction === 'deposit' ? 'LUSD' as const : 'UUSD' as const;
                const toToken = result.direction === 'deposit' ? 'UUSD' as const : 'LUSD' as const;

                await this.services.swapService.executeSwap({
                    fromToken,
                    toToken,
                    amountIn: result.inputAmount,
                    minAmountOut: result.expectedOutput * 995n / 1000n, // 0.5% slippage
                    slippageTolerance: 0.005
                });
                break;

            default:
                throw new Error(`Unsupported route type: ${result.routeType}`);
        }
    }

    /**
     * Handle transaction start
     */
    handleTransactionStart(): void {
        this.transactionStateService.startTransaction('exchangeButton');
    }

    /**
     * Handle transaction submitted (hash received)
     */
    handleTransactionSubmitted(hash: string): void {
        this.transactionStateService.updateTransactionHash('exchangeButton', hash);
    }

    /**
     * Handle transaction success
     */
    handleTransactionSuccess(operation: string): void {
        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;

        const direction = this.currentDirection === 'deposit' ? 'Deposited' : 'Withdrew';
        this.transactionStateService.completeTransaction('exchangeButton', `✅ ${direction}!`);

        if (amountInput) {
            this.services.notificationManager.showSuccess('exchange', `Successfully ${direction.toLowerCase()} ${amountInput.value} ${this.currentDirection === 'deposit' ? 'LUSD' : 'UUSD'}!`);
            amountInput.value = '';
            this.updateOutput();
        }
    }

    /**
     * Handle transaction error
     */
    handleTransactionError(error: Error): void {
        this.transactionStateService.errorTransaction('exchangeButton', error.message, '❌ Try Again');

        // Analyze error for oracle issues
        const errorMessage = error.message || 'Transaction failed. Please try again.';
        const oracleAnalysis = analyzeOracleError(errorMessage);

        if (oracleAnalysis.isOracleIssue) {
            this.services.notificationManager.showError('exchange', oracleAnalysis.userMessage);
            this.showOracleHelpButton();
        } else if (errorMessage.includes('Wrong network')) {
            this.services.notificationManager.showError('exchange', 'Wrong network. Please switch to Ethereum mainnet.');
        } else {
            this.services.notificationManager.showError('exchange', errorMessage);
        }

        // Update button state
        this.updateOutput();
    }

    /**
     * Handle approval needed event
     */
    handleApprovalNeeded(tokenSymbol: string): void {
        const handlers = TransactionButtonUtils.createTransactionHandlers('exchangeButton');
        handlers.handleApprovalNeeded(tokenSymbol);
        this.updateOutput();
    }

    /**
     * Handle approval complete event
     */
    handleApprovalComplete(): void {
        const handlers = TransactionButtonUtils.createTransactionHandlers('exchangeButton');
        handlers.handleApprovalComplete();
        this.updateOutput();
    }

    /**
     * Show calculation error
     */
    private showCalculationError(): void {
        const exchangeOutput = document.getElementById('exchangeOutput');
        const exchangeButton = document.getElementById('exchangeButton') as HTMLButtonElement;

        if (exchangeOutput) {
            exchangeOutput.style.display = 'none';
        }

        if (exchangeButton) {
            exchangeButton.textContent = 'Calculation error';
            exchangeButton.disabled = true;
        }
    }

    /**
     * Clear form to initial state
     */
    clearForm(): void {
        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;
        const exchangeOutput = document.getElementById('exchangeOutput');

        if (amountInput) amountInput.value = '';
        if (exchangeOutput) exchangeOutput.style.display = 'none';

        this.services.notificationManager.clearNotifications('exchange');
    }

    /**
     * Update wallet connection state
     */
    updateWalletConnection(isConnected: boolean): void {
        const button = document.getElementById('exchangeButton') as HTMLButtonElement;
        if (button) {
            button.disabled = !isConnected;
            if (!isConnected) {
                button.textContent = 'Connect wallet first';
            } else {
                this.updateOutput();
            }
        }
    }

    /**
     * Show oracle help button when oracle issues are detected
     */
    private showOracleHelpButton(): void {
        const notificationContainer = document.querySelector('.notification-container[data-type="exchange"]');
        if (!notificationContainer) return;

        if (notificationContainer.querySelector('.oracle-help-btn')) return;

        const helpButton = OracleStatusComponent.createHelpButton('app');
        helpButton.style.cssText += `
            display: block;
            margin: 10px auto 0 auto;
            width: fit-content;
        `;

        notificationContainer.appendChild(helpButton);
    }

    /**
     * Setup balance update subscription
     */
    private setupBalanceSubscription(): void {
        if (this.services.inventoryBar) {
            this.services.inventoryBar.onBalancesUpdated(() => {
                this.autoPopulateWithMaxBalance();
            });
        }
    }

    /**
     * Auto-populate input with maximum balance of current direction token
     */
    autoPopulateWithMaxBalance(): void {
        if (!this.services.walletService.isConnected()) {
            return;
        }

        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;
        if (!amountInput || (amountInput.value && amountInput.value !== '0')) {
            return;
        }

        try {
            const tokenSymbol = this.currentDirection === 'deposit' ? 'LUSD' : 'UUSD';

            if (hasAvailableBalance(this.services.inventoryBar, tokenSymbol)) {
                const maxBalance = getMaxTokenBalance(this.services.inventoryBar, tokenSymbol);
                amountInput.value = maxBalance;
                this.updateOutput();
            }
        } catch (error) {
            // Silently fail - don't disrupt user experience
        }
    }

    /**
     * Update visibility of options (UBQ + LUSD checkbox for mint, UBQ redemption for redeem)
     */
    private updateOptionsVisibility(shouldShow: boolean): void {
        const mintOptionsGroup = document.getElementById('mintOptionsGroup');
        const redeemOptionsGroup = document.getElementById('redeemOptionsGroup');
        const ubqAmountGroup = document.getElementById('ubqAmountGroup');

        if (this.currentDirection === 'deposit') {
            // Show mint options and UBQ amount for deposits
            if (mintOptionsGroup) {
                mintOptionsGroup.style.display = shouldShow ? 'block' : 'none';
            }
            if (ubqAmountGroup) {
                ubqAmountGroup.style.display = shouldShow ? 'block' : 'none';
            }
            if (redeemOptionsGroup) {
                redeemOptionsGroup.style.display = 'none';
            }
        } else {
            // Show redeem options for withdrawals
            if (mintOptionsGroup) {
                mintOptionsGroup.style.display = 'none';
            }
            if (ubqAmountGroup) {
                ubqAmountGroup.style.display = 'none';
            }
            if (redeemOptionsGroup) {
                redeemOptionsGroup.style.display = shouldShow ? 'block' : 'none';
            }
        }
    }

    /**
     * Legacy method for backward compatibility
     */
    private updateMintOptionsVisibility(shouldShow: boolean): void {
        this.updateOptionsVisibility(shouldShow);
    }

    /**
     * Get current direction
     */
    getCurrentDirection(): ExchangeDirection {
        return this.currentDirection;
    }
}
