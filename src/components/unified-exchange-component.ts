import { parseEther, formatEther, formatUnits, type Address } from 'viem';
import type { WalletService } from '../services/wallet-service.ts';
import type { ContractService, ProtocolSettings } from '../services/contract-service.ts';
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

interface UIState {
    direction: ExchangeDirection;
    isRedemptionAllowed: boolean;
    forceSwapOnly: boolean;
    forceCollateralOnly: boolean;
    protocolSettings: ProtocolSettings | null;
    isCalculating: boolean;
    currentAmount: string;
    lastRouteResult: OptimalRouteResult | null;
    showOutput: boolean;
    showOptions: boolean;
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
    private transactionStateService: TransactionStateService;

    // Centralized UI state - single source of truth
    private uiState: UIState = {
        direction: 'deposit',
        isRedemptionAllowed: true,
        forceSwapOnly: false,
        forceCollateralOnly: true, // Default checked as per HTML
        protocolSettings: null,
        isCalculating: false,
        currentAmount: '',
        lastRouteResult: null,
        showOutput: false,
        showOptions: false
    };

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
        this.loadProtocolSettings();

        // Initial render to set up UI state
        this.render();
    }

    /**
     * Update UI state and trigger re-render
     */
    private setState(updates: Partial<UIState>): void {
        this.uiState = { ...this.uiState, ...updates };
        this.render();
    }

    /**
     * Single render method - applies all UI state to DOM synchronously
     */
    private render(): void {
        // Update direction buttons
        const depositButton = document.getElementById('depositButton') as HTMLButtonElement;
        const withdrawButton = document.getElementById('withdrawButton') as HTMLButtonElement;
        if (depositButton && withdrawButton) {
            depositButton.classList.toggle('active', this.uiState.direction === 'deposit');
            withdrawButton.classList.toggle('active', this.uiState.direction === 'withdraw');
        }

        // Update input label and placeholder
        const amountLabel = document.getElementById('amountLabel') as HTMLLabelElement;
        const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;
        if (amountLabel) {
            amountLabel.textContent = this.uiState.direction === 'deposit' ? 'LUSD' : 'UUSD';
        }
        if (amountInput) {
            amountInput.placeholder = this.uiState.direction === 'deposit' ? 'Enter LUSD amount' : 'Enter UUSD amount';
        }

        // Update checkboxes based on state
        const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;
        const redeemLusdOnly = document.getElementById('redeemLusdOnly') as HTMLInputElement;

        if (forceCollateralOnly) {
            forceCollateralOnly.checked = this.uiState.forceCollateralOnly;
        }

        if (redeemLusdOnly) {
            redeemLusdOnly.checked = this.uiState.forceSwapOnly;
            redeemLusdOnly.disabled = !this.uiState.isRedemptionAllowed || this.uiState.forceSwapOnly;
        }

        // Update options visibility
        this.renderOptionsVisibility();

        // Update output section
        this.renderOutput();

        console.log('🔄 UI State rendered:', {
            direction: this.uiState.direction,
            isRedemptionAllowed: this.uiState.isRedemptionAllowed,
            forceSwapOnly: this.uiState.forceSwapOnly,
            forceCollateralOnly: this.uiState.forceCollateralOnly
        });
    }

    /**
     * Render options visibility based on current state
     */
    private renderOptionsVisibility(): void {
        const mintOptionsGroup = document.getElementById('mintOptionsGroup');
        const redeemOptionsGroup = document.getElementById('redeemOptionsGroup');
        const ubqAmountGroup = document.getElementById('ubqAmountGroup');

        if (this.uiState.direction === 'deposit') {
            // Show mint options and UBQ amount for deposits based on protocol state
            if (mintOptionsGroup) {
                const showMintOptions = this.uiState.showOptions && !this.uiState.protocolSettings?.isFullyAlgorithmic;
                mintOptionsGroup.style.display = showMintOptions ? 'block' : 'none';
            }
            if (ubqAmountGroup) {
                const showUbqAmount = this.uiState.showOptions && !this.uiState.protocolSettings?.isFullyCollateralized;
                ubqAmountGroup.style.display = showUbqAmount ? 'block' : 'none';
            }
            if (redeemOptionsGroup) {
                redeemOptionsGroup.style.display = 'none';
            }
        } else {
            // Show redeem options for withdrawals based on protocol state
            if (mintOptionsGroup) {
                mintOptionsGroup.style.display = 'none';
            }
            if (ubqAmountGroup) {
                ubqAmountGroup.style.display = 'none';
            }
            if (redeemOptionsGroup) {
                const showRedeemOptions = this.uiState.showOptions && !this.uiState.protocolSettings?.isFullyCollateralized;
                redeemOptionsGroup.style.display = showRedeemOptions ? 'block' : 'none';
            }
        }
    }

    /**
     * Render output section based on current state
     */
    private renderOutput(): void {
        const exchangeOutput = document.getElementById('exchangeOutput');
        const exchangeButton = document.getElementById('exchangeButton') as HTMLButtonElement;

        if (!exchangeOutput || !exchangeButton) return;

        if (!this.uiState.showOutput || !this.uiState.currentAmount || this.uiState.currentAmount === '0') {
            exchangeOutput.style.display = 'none';
            exchangeButton.textContent = 'Enter amount to continue';
            exchangeButton.disabled = true;
            return;
        }

        exchangeOutput.style.display = 'block';

        // Update route display if we have results
        if (this.uiState.lastRouteResult) {
            this.updateRouteDisplayFromState(this.uiState.lastRouteResult);
        }

        // Update button if wallet is connected
        if (this.services.walletService.isConnected() && this.uiState.lastRouteResult) {
            this.updateActionButtonFromState(this.uiState.lastRouteResult);
        }
    }

    /**
     * Update the route display in the UI from state
     */
    private updateRouteDisplayFromState(result: OptimalRouteResult): void {
        this.updateRouteDisplay(result);
    }

    /**
     * Update the action button based on the optimal route from state
     */
    private updateActionButtonFromState(result: OptimalRouteResult): void {
        this.updateActionButton(result);
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
        // Set loading state IMMEDIATELY on button click
        this.transactionStateService.startTransaction('exchangeButton');

        if (!this.services.walletService.isConnected()) {
            this.transactionStateService.errorTransaction('exchangeButton', 'Wallet not connected', '❌ Connect Wallet');
            this.services.notificationManager.showError('exchange', 'Please connect wallet first');
            return;
        }

        try {
            const amountInput = document.getElementById('exchangeAmount') as HTMLInputElement;

            if (!amountInput?.value) {
                this.transactionStateService.errorTransaction('exchangeButton', 'No amount entered', '❌ Enter Amount');
                this.services.notificationManager.showError('exchange', 'Please enter a valid amount');
                return;
            }

            const amount = parseEther(amountInput.value);

            // Calculate optimal route with current state
            let routeResult: OptimalRouteResult;
            if (this.uiState.direction === 'deposit') {
                routeResult = await this.optimalRouteService.getOptimalDepositRoute(amount, this.uiState.forceCollateralOnly);
            } else {
                routeResult = await this.optimalRouteService.getOptimalWithdrawRoute(amount, this.uiState.forceSwapOnly);
            }

            // Execute the optimal route
            await this.executeOptimalRoute(routeResult);

        } catch (error: any) {
            // Reset button state on error
            this.transactionStateService.errorTransaction('exchangeButton', error.message || 'Transaction failed', '❌ Try Again');

            if (error instanceof Error && error.message.includes('does not match') &&
                (error.message.includes('target chain') || error.message.includes('current chain'))) {

                const chainIdMatch = error.message.match(/chain.*?(\d+)/g);
                if (chainIdMatch && chainIdMatch.length >= 2) {
                    const currentChainId = chainIdMatch[0].match(/\d+/)?.[0];
                    const targetChainMatch = error.message.match(/id: (\d+) – (\w+)/);
                    const targetChainId = targetChainMatch?.[1];
                    const targetChainName = targetChainMatch?.[2] || `chain ${targetChainId}`;

                    this.services.notificationManager.showError('exchange',
                        `Please switch your wallet from chain ${currentChainId} to ${targetChainName} (chain ${targetChainId}) to continue`);
                } else {
                    this.services.notificationManager.showError('exchange', 'Chain mismatch error: Please switch to the correct network');
                }
            } else {
                this.services.notificationManager.showError('exchange', error.message || 'Transaction failed. Please try again.');
            }
            console.error('Exchange transaction failed:', error);
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

            if (amountInput) {
                // Try multiple event types
                amountInput.addEventListener('input', () => {
                    this.updateOutput();
                });
                amountInput.addEventListener('keyup', () => {
                    this.updateOutput();
                });
                amountInput.addEventListener('change', () => {
                    this.updateOutput();
                });

            } else {
                console.error('❌ amountInput not found!');
            }

            if (forceCollateralOnly) {
                forceCollateralOnly.addEventListener('change', () => {
                    this.setState({ forceCollateralOnly: forceCollateralOnly.checked });
                    this.updateOutput();
                });
            }

            if (redeemLusdOnly) {
                redeemLusdOnly.addEventListener('change', () => {
                    this.setState({ forceSwapOnly: redeemLusdOnly.checked });
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
    private async switchDirection(direction: ExchangeDirection): Promise<void> {
        console.log(`🔄 Switching direction to: ${direction}`);

        // Clear form first
        this.clearForm();

        // Check redemption status IMMEDIATELY when switching to withdraw (no timeout)
        let isRedemptionAllowed = true;
        if (direction === 'withdraw') {
            isRedemptionAllowed = await this.checkRedemptionAllowedSync();
        }

        // Update state synchronously - this triggers render()
        this.setState({
            direction,
            isRedemptionAllowed,
            forceSwapOnly: direction === 'withdraw' ? !isRedemptionAllowed : false,
            currentAmount: '',
            lastRouteResult: null,
            showOutput: false,
            showOptions: false
        });

        // Auto-populate and calculate after state is updated
        this.autoPopulateWithMaxBalance();
        this.updateOutput();
    }

    /**
     * Load protocol settings from contract
     */
    private async loadProtocolSettings(): Promise<void> {
        try {
            const protocolSettings = await this.services.contractService.getProtocolSettings(LUSD_COLLATERAL.index);

            // Update state with protocol settings
            this.setState({ protocolSettings });

            // Update UI labels with actual ratios
            this.updateProtocolLabels();
        } catch (error) {
            console.error('Failed to load protocol settings:', error);
            // Don't fail completely, just use fallback behavior
        }
    }

    /**
     * Update UI labels with actual protocol ratios
     */
    private updateProtocolLabels(): void {
        if (!this.uiState.protocolSettings) return;

        const { collateralRatioPercentage, governanceRatioPercentage } = this.uiState.protocolSettings;

        // Update mint options explanation
        const mintExplanation = document.querySelector('#mintOptionsGroup .explanation-text');
        if (mintExplanation) {
            mintExplanation.textContent = `Unchecked: Use ${collateralRatioPercentage}% LUSD + ${governanceRatioPercentage}% UBQ`;
        }

        // Update redeem checkbox label based on protocol state
        const redeemCheckboxLabel = document.querySelector('label[for="redeemLusdOnly"]');
        if (redeemCheckboxLabel) {
            if (this.uiState.protocolSettings.isFullyCollateralized) {
                redeemCheckboxLabel.textContent = 'LUSD only (redundant - already 100% LUSD)';
            } else {
                redeemCheckboxLabel.textContent = 'Swap for LUSD only (via Curve)';
            }
        }
    }

    /**
     * Check if redemption is currently allowed based on TWAP price conditions
     * Returns boolean result for state management - does NOT manipulate DOM
     */
    private async checkRedemptionAllowedSync(): Promise<boolean> {
        try {
            const testAmount = parseEther('1');
            const routeResult = await this.optimalRouteService.getOptimalWithdrawRoute(testAmount, false);
            const isRedemptionAllowed = routeResult.routeType === 'redeem';

            if (!isRedemptionAllowed) {
                console.log('🔒 Redemption disabled due to TWAP conditions - will auto-enable "Swap for LUSD only"');
            } else {
                console.log('✅ Redemption enabled - user can choose redemption method');
            }

            return isRedemptionAllowed;
        } catch (error) {
            console.error('Error checking redemption status:', error);
            console.log('🔒 Error checking redemption - will auto-enable "Swap for LUSD only" for safety');
            return false;
        }
    }

    /**
     * Legacy method for backward compatibility - now updates state instead of DOM
     */
    private async checkRedemptionAllowed(): Promise<boolean> {
        const isRedemptionAllowed = await this.checkRedemptionAllowedSync();

        // Update state instead of direct DOM manipulation
        this.setState({
            isRedemptionAllowed,
            forceSwapOnly: !isRedemptionAllowed
        });

        return isRedemptionAllowed;
    }

    /**
     * Update exchange output with optimal route calculation
     */
    async updateOutput(): Promise<void> {
        // Clear existing timer
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }

        // Debounce the calculation - but update state, not DOM
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
            if (!amountInput) return;

            const amount = amountInput.value;

            // Update current amount in state
            this.setState({
                currentAmount: amount,
                isCalculating: true
            });

            if (!amount || amount === '0') {
                this.setState({
                    showOutput: false,
                    showOptions: false,
                    lastRouteResult: null,
                    isCalculating: false
                });
                return;
            }

            // Refresh protocol settings if needed
            if (!this.uiState.protocolSettings) {
                await this.loadProtocolSettings();
            }

            const inputAmount = parseEther(amount);

            // Calculate optimal route using current state
            let routeResult: OptimalRouteResult;

            if (this.uiState.direction === 'deposit') {
                routeResult = await this.optimalRouteService.getOptimalDepositRoute(inputAmount, this.uiState.forceCollateralOnly);
            } else {
                routeResult = await this.optimalRouteService.getOptimalWithdrawRoute(inputAmount, this.uiState.forceSwapOnly);
            }

            // Update state with results - this triggers render()
            this.setState({
                lastRouteResult: routeResult,
                showOutput: true,
                showOptions: true,
                isCalculating: false
            });

        } catch (error) {
            console.error('Error calculating optimal route:', error);
            this.setState({
                showOutput: false,
                showOptions: false,
                lastRouteResult: null,
                isCalculating: false
            });
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
            const actionVerb = result.direction === 'deposit' ? 'Buy' : 'Sell';
            button.textContent = `${actionVerb}`;
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

        switch (result.routeType) {
            case 'mint':
                await this.services.transactionService.executeMint({
                    collateralIndex: LUSD_COLLATERAL.index,
                    dollarAmount: result.inputAmount,
                    isForceCollateralOnly: this.uiState.forceCollateralOnly
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
                    // isLusdOnlyRedemption: this.uiState.forceSwapOnly
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

        const direction = this.uiState.direction === 'deposit' ? 'Deposited' : 'Withdrew';
        this.transactionStateService.completeTransaction('exchangeButton', `✅ ${direction}!`);

        if (amountInput) {
            this.services.notificationManager.showSuccess('exchange', `Successfully ${direction.toLowerCase()} ${amountInput.value} ${this.uiState.direction === 'deposit' ? 'LUSD' : 'UUSD'}!`);
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
                // Refresh protocol settings when wallet connects
                this.loadProtocolSettings();
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
            const tokenSymbol = this.uiState.direction === 'deposit' ? 'LUSD' : 'UUSD';

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
     * Legacy method - now updates state instead
     */
    private updateOptionsVisibility(shouldShow: boolean): void {
        this.setState({ showOptions: shouldShow });
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
        return this.uiState.direction;
    }
}
