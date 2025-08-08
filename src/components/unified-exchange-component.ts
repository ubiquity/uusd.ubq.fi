import { parseEther, formatEther, formatUnits, type Address } from 'viem';
import type { WalletService } from '../services/wallet-service.ts';
import type { ContractService } from '../services/contract-service.ts';
import type { PriceService } from '../services/price-service.ts';
import type { CurvePriceService } from '../services/curve-price-service.ts';
import type { TransactionService } from '../services/transaction-service.ts';
import type { SwapService } from '../services/swap-service.ts';
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

    constructor(services: UnifiedExchangeServices) {
        this.services = services;
        this.optimalRouteService = new OptimalRouteService(
            services.priceService,
            services.curvePriceService,
            services.contractService
        );
        this.setupEventListeners();
        this.setupBalanceSubscription();
    }

    /**
     * Setup event listeners for the unified form
     */
    private setupEventListeners(): void {
        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;
        const depositButton = document.getElementById('depositButton') as HTMLButtonElement;
        const withdrawButton = document.getElementById('withdrawButton') as HTMLButtonElement;

        amountInput?.addEventListener('input', () => this.updateOutput());

        depositButton?.addEventListener('click', () => this.switchDirection('deposit'));
        withdrawButton?.addEventListener('click', () => this.switchDirection('withdraw'));
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
            amountLabel.textContent = direction === 'deposit' ? 'Deposit Amount (LUSD)' : 'Withdraw Amount (UUSD)';
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
        // Clear existing timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Debounce the calculation
        this.debounceTimer = setTimeout(async () => {
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

            if (!amountInput || !exchangeOutput || !exchangeButton) {
                return;
            }

            const amount = amountInput.value;

            if (!amount || amount === '0') {
                exchangeOutput.style.display = 'none';
                exchangeButton.textContent = 'Enter amount to continue';
                exchangeButton.disabled = true;
                return;
            }

            exchangeOutput.style.display = 'block';

            const inputAmount = parseEther(amount);

            // Calculate optimal route
            let routeResult: OptimalRouteResult;
            console.log('🔍 Current direction:', this.currentDirection);
            if (this.currentDirection === 'deposit') {
                console.log('📈 Calling getOptimalDepositRoute');
                routeResult = await this.optimalRouteService.getOptimalDepositRoute(inputAmount);
            } else {
                console.log('📉 Calling getOptimalWithdrawRoute');
                routeResult = await this.optimalRouteService.getOptimalWithdrawRoute(inputAmount);
            }

            console.log('📊 Route result:', routeResult);

            // Update UI with route information
            await this.updateRouteDisplay(routeResult);

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
        if (routeTypeElement) {
            let actionText = '';
            switch (result.routeType) {
                case 'mint':
                    actionText = '🔨 Minting';
                    break;
                case 'redeem':
                    actionText = '🔄 Redeeming';
                    break;
                case 'swap':
                    actionText = '🔀 Swapping';
                    break;
            }
            routeTypeElement.textContent = actionText;
        }

        // Expected output
        if (expectedOutputElement) {
            const outputToken = result.direction === 'deposit' ? 'UUSD' : 'LUSD';
            expectedOutputElement.textContent = `${formatEther(result.expectedOutput)} ${outputToken}`;
        }

        // Market price
        if (marketPriceElement) {
            marketPriceElement.textContent = `$${formatUnits(result.marketPrice, 6)}`;
        }

        // Savings display
        if (savingsElement) {
            if (result.savings.percentage > 0) {
                savingsElement.textContent = `Save ${result.savings.percentage.toFixed(2)}% (${formatEther(result.savings.amount)} tokens)`;
                savingsElement.style.display = 'block';
                savingsElement.className = 'savings-positive';
            } else {
                savingsElement.style.display = 'none';
            }
        }

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
                : '0x0F644658510c95CB46955e55D7BA9DDa9E9fBEc6' as Address;
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
     * Handle form submission
     */
    async handleSubmit(event: Event): Promise<void> {
        event.preventDefault();

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
            this.handleTransactionError(error);
        }
    }

    /**
     * Execute the optimal route transaction
     */
    private async executeOptimalRoute(result: OptimalRouteResult): Promise<void> {
        const account = this.services.walletService.getAccount()!;

        switch (result.routeType) {
            case 'mint':
                await this.services.transactionService.executeMint({
                    collateralIndex: LUSD_COLLATERAL.index,
                    dollarAmount: result.inputAmount,
                    isForceCollateralOnly: false
                });
                break;

            case 'redeem':
                await this.services.transactionService.executeRedeem({
                    collateralIndex: LUSD_COLLATERAL.index,
                    dollarAmount: result.inputAmount
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
        const button = document.getElementById('exchangeButton') as HTMLButtonElement;
        if (button) {
            button.disabled = true;
            button.innerHTML = `Processing...<span class="loading"></span>`;
        }
    }

    /**
     * Handle transaction success
     */
    handleTransactionSuccess(operation: string): void {
        const button = document.getElementById('exchangeButton') as HTMLButtonElement;
        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;

        if (button) {
            button.disabled = false;
        }

        if (amountInput) {
            const direction = this.currentDirection === 'deposit' ? 'Deposited' : 'Withdrew';
            this.services.notificationManager.showSuccess('exchange', `Successfully ${direction.toLowerCase()} ${amountInput.value} ${this.currentDirection === 'deposit' ? 'LUSD' : 'UUSD'}!`);
            amountInput.value = '';
            this.updateOutput();
        }
    }

    /**
     * Handle transaction error
     */
    handleTransactionError(error: Error): void {
        const button = document.getElementById('exchangeButton') as HTMLButtonElement;
        if (button) {
            button.disabled = false;
        }

        // Analyze error for oracle issues
        const errorMessage = error.message || 'Transaction failed. Please try again.';
        const oracleAnalysis = analyzeOracleError(errorMessage);

        if (oracleAnalysis.isOracleIssue) {
            this.services.notificationManager.showError('exchange', oracleAnalysis.userMessage);
            this.showOracleHelpButton();
        } else {
            this.services.notificationManager.showError('exchange', errorMessage);
        }

        // Update button state
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
     * Get current direction
     */
    getCurrentDirection(): ExchangeDirection {
        return this.currentDirection;
    }
}
