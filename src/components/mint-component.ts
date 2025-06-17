import { parseEther, formatEther, formatUnits, type Address } from 'viem';
import type { WalletService } from '../services/wallet-service.ts';
import type { ContractService } from '../services/contract-service.ts';
import type { PriceService } from '../services/price-service.ts';
import type { TransactionService, TransactionOperation } from '../services/transaction-service.ts';
import { LUSD_COLLATERAL } from '../contracts/constants.ts';
import type { NotificationManager } from './notification-manager.ts';
import { OracleStatusComponent } from './oracle-status-component.ts';
import { analyzeOracleError } from '../utils/oracle-utils.ts';

interface MintServices {
    walletService: WalletService;
    contractService: ContractService;
    priceService: PriceService;
    transactionService: TransactionService;
    notificationManager: NotificationManager;
}

/**
 * Mint Component
 * Handles all mint form UI logic and interactions
 */
export class MintComponent {
    private services: MintServices;

    constructor(services: MintServices) {
        this.services = services;
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for mint form inputs
     */
    private setupEventListeners(): void {
        const mintAmount = document.getElementById('mintAmount') as HTMLInputElement;
        const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;

        mintAmount?.addEventListener('input', () => this.updateOutput());
        forceCollateralOnly?.addEventListener('change', () => this.updateOutput());
    }

    /**
     * Update mint output based on current form values
     */
    async updateOutput(): Promise<void> {
        try {
            const amountInput = document.getElementById('mintAmount') as HTMLInputElement;
            const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;

            if (!amountInput || !forceCollateralOnly) {
                return;
            }

            const amount = amountInput.value;

            if (!amount || amount === '0') {
                const mintOutput = document.getElementById('mintOutput');
                const mintButton = document.getElementById('mintButton');
                if (mintOutput) mintOutput.style.display = 'none';
                if (mintButton) mintButton.textContent = 'Enter amount to continue';
                return;
            }

            const mintOutput = document.getElementById('mintOutput');
            if (mintOutput) mintOutput.style.display = 'block';

            const dollarAmount = parseEther(amount);
            const isForceCollateralOnly = forceCollateralOnly.checked;

            // Calculate mint output using price service with hardcoded LUSD
            const result = await this.services.priceService.calculateMintOutput({
                dollarAmount,
                collateralIndex: LUSD_COLLATERAL.index,
                isForceCollateralOnly
            });

            // Update UI with LUSD hardcoded values
            const collateralNeeded = document.getElementById('collateralNeeded');
            const ubqNeeded = document.getElementById('ubqNeeded');
            const mintingFee = document.getElementById('mintingFee');
            const totalMinted = document.getElementById('totalMinted');

            if (collateralNeeded) {
                collateralNeeded.textContent = `${formatUnits(result.collateralNeeded, 18 - LUSD_COLLATERAL.missingDecimals)} ${LUSD_COLLATERAL.name}`;
            }
            if (ubqNeeded) {
                ubqNeeded.textContent = `${formatEther(result.governanceNeeded)} UBQ`;
            }
            if (mintingFee) {
                mintingFee.textContent = `${LUSD_COLLATERAL.mintingFee}%`;
            }
            if (totalMinted) {
                totalMinted.textContent = `${formatEther(result.totalDollarMint)} UUSD`;
            }

            // Update button text based on approval status
            if (this.services.walletService.isConnected()) {
                await this.updateButton(LUSD_COLLATERAL, result);
            }
        } catch (error) {
            console.error('Error updating mint output:', error);
        }
    }

    /**
     * Update mint button text based on approval status
     */
    private async updateButton(collateral: typeof LUSD_COLLATERAL, result: any): Promise<void> {
        const button = document.getElementById('mintButton') as HTMLButtonElement;
        const account = this.services.walletService.getAccount();

        if (!account) {
            button.textContent = 'Connect wallet first';
            return;
        }

        // Check approval status
        const approvalStatus = await this.services.transactionService.getMintApprovalStatus(
            collateral,
            account,
            result
        );

        if (approvalStatus.needsCollateralApproval) {
            button.textContent = `Approve ${collateral.name}`;
        } else if (approvalStatus.needsGovernanceApproval) {
            button.textContent = 'Approve UBQ';
        } else {
            button.textContent = 'Mint UUSD';
        }
    }

    /**
     * Handle mint form submission
     */
    async handleSubmit(event: Event): Promise<void> {
        event.preventDefault();

        if (!this.services.walletService.isConnected()) {
            this.services.notificationManager.showError('mint', 'Please connect wallet first');
            return;
        }

        try {
            const amountInput = document.getElementById('mintAmount') as HTMLInputElement;
            const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;

            if (!amountInput?.value) {
                this.services.notificationManager.showError('mint', 'Please enter a valid amount');
                return;
            }

            const amount = parseEther(amountInput.value);

            console.log('Starting mint transaction:', {
                amount: amountInput.value,
                collateralIndex: LUSD_COLLATERAL.index,
                isForceCollateralOnly: forceCollateralOnly.checked
            });

            await this.services.transactionService.executeMint({
                collateralIndex: LUSD_COLLATERAL.index,
                dollarAmount: amount,
                isForceCollateralOnly: forceCollateralOnly.checked
            });

        } catch (error: any) {
            console.error('Mint transaction failed:', error);

            // Re-enable the button and show error
            const button = document.getElementById('mintButton') as HTMLButtonElement;
            if (button) {
                button.disabled = false;
                // Reset button text based on current state
                this.updateOutput();
            }

            // Analyze error for oracle issues and provide enhanced messaging
            const errorMessage = error.message || 'Transaction failed. Please try again.';
            const oracleAnalysis = analyzeOracleError(errorMessage);

            if (oracleAnalysis.isOracleIssue) {
                // Show oracle-specific error with help button
                this.services.notificationManager.showError('mint', oracleAnalysis.userMessage);
                this.showOracleHelpButton();
            } else {
                this.services.notificationManager.showError('mint', errorMessage);
            }
        }
    }

    /**
     * Handle transaction start
     */
    handleTransactionStart(): void {
        const button = document.getElementById('mintButton') as HTMLButtonElement;
        if (button) {
            button.disabled = true;
            button.innerHTML = `Minting...<span class="loading"></span>`;
        }
    }

    /**
     * Handle transaction success
     */
    handleTransactionSuccess(): void {
        const button = document.getElementById('mintButton') as HTMLButtonElement;
        const amountInput = document.getElementById('mintAmount') as HTMLInputElement;

        if (button) {
            button.disabled = false;
        }

        if (amountInput) {
            this.services.notificationManager.showSuccess('mint', `Successfully minted ${amountInput.value} UUSD!`);
            amountInput.value = '';
            this.updateOutput();
        }
    }

    /**
     * Handle transaction error
     */
    handleTransactionError(error: Error): void {
        const button = document.getElementById('mintButton') as HTMLButtonElement;
        if (button) {
            button.disabled = false;
        }

        this.services.notificationManager.showError('mint', error.message);
    }

    /**
     * Handle approval needed event
     */
    handleApprovalNeeded(tokenSymbol: string): void {
        const button = document.getElementById('mintButton') as HTMLButtonElement;
        if (button) {
            button.innerHTML = `Approving ${tokenSymbol}...<span class="loading"></span>`;
        }
    }

    /**
     * Handle approval complete event
     */
    handleApprovalComplete(): void {
        this.updateOutput();
    }

    /**
     * Reset form to initial state
     */
    resetForm(): void {
        const amountInput = document.getElementById('mintAmount') as HTMLInputElement;
        const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;

        if (amountInput) amountInput.value = '';
        if (forceCollateralOnly) forceCollateralOnly.checked = false;

        const mintOutput = document.getElementById('mintOutput');
        if (mintOutput) mintOutput.style.display = 'none';

        this.services.notificationManager.clearNotifications('mint');
    }

    /**
     * Update wallet connection state
     */
    updateWalletConnection(isConnected: boolean): void {
        const button = document.getElementById('mintButton') as HTMLButtonElement;
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
        // Find the notification container for mint
        const notificationContainer = document.querySelector('.notification-container[data-type="mint"]');
        if (!notificationContainer) return;

        // Check if help button already exists
        if (notificationContainer.querySelector('.oracle-help-btn')) return;

        // Create and append oracle help button
        const helpButton = OracleStatusComponent.createHelpButton('app');
        helpButton.style.cssText += `
            display: block;
            margin: 10px auto 0 auto;
            width: fit-content;
        `;

        notificationContainer.appendChild(helpButton);
    }
}
