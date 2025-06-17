import { parseEther, formatEther, formatUnits, type Address } from 'viem';
import type { WalletService } from '../services/wallet-service.ts';
import type { ContractService } from '../services/contract-service.ts';
import type { PriceService } from '../services/price-service.ts';
import type { TransactionService } from '../services/transaction-service.ts';
import { TransactionOperation } from '../services/transaction-service.ts';
import { LUSD_COLLATERAL } from '../contracts/constants.ts';
import type { NotificationManager } from './notification-manager.ts';

interface RedeemServices {
    walletService: WalletService;
    contractService: ContractService;
    priceService: PriceService;
    transactionService: TransactionService;
    notificationManager: NotificationManager;
}

/**
 * Redeem Component
 * Handles all redeem form UI logic and interactions
 */
export class RedeemComponent {
    private services: RedeemServices;

    constructor(services: RedeemServices) {
        this.services = services;
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for redeem form inputs
     */
    private setupEventListeners(): void {
        const redeemAmount = document.getElementById('redeemAmount') as HTMLInputElement;

        redeemAmount?.addEventListener('input', () => this.updateOutput());
    }


    /**
     * Update redeem output based on current form values
     */
    async updateOutput(): Promise<void> {
        try {
            const amountInput = document.getElementById('redeemAmount') as HTMLInputElement;

            if (!amountInput) {
                return;
            }

            const amount = amountInput.value;

            if (!amount || amount === '0') {
                const redeemOutput = document.getElementById('redeemOutput');
                const redeemButton = document.getElementById('redeemButton');
                if (redeemOutput) redeemOutput.style.display = 'none';
                if (redeemButton) redeemButton.textContent = 'Enter amount to continue';
                return;
            }

            const redeemOutput = document.getElementById('redeemOutput');
            if (redeemOutput) redeemOutput.style.display = 'block';

            const dollarAmount = parseEther(amount);

            // Calculate redeem output using price service with hardcoded LUSD
            const result = await this.services.priceService.calculateRedeemOutput({
                dollarAmount,
                collateralIndex: LUSD_COLLATERAL.index
            });

            // Update UI with LUSD hardcoded values
            const collateralRedeemed = document.getElementById('collateralRedeemed');
            const ubqRedeemed = document.getElementById('ubqRedeemed');
            const redemptionFee = document.getElementById('redemptionFee');

            if (collateralRedeemed) {
                collateralRedeemed.textContent = `${formatUnits(result.collateralRedeemed, 18 - LUSD_COLLATERAL.missingDecimals)} ${LUSD_COLLATERAL.name}`;
            }
            if (ubqRedeemed) {
                ubqRedeemed.textContent = `${formatEther(result.governanceRedeemed)} UBQ`;
            }
            if (redemptionFee) {
                redemptionFee.textContent = `${LUSD_COLLATERAL.redemptionFee}%`;
            }

            // Update button text
            if (this.services.walletService.isConnected()) {
                await this.updateButton(LUSD_COLLATERAL.index, dollarAmount);
            }
        } catch (error) {
            console.error('Error updating redeem output:', error);
        }
    }

    /**
     * Update redeem button text based on approval status and pending redemptions
     */
    private async updateButton(collateralIndex: number, amount: bigint): Promise<void> {
        const button = document.getElementById('redeemButton') as HTMLButtonElement;
        const account = this.services.walletService.getAccount();

        if (!account) {
            button.textContent = 'Connect wallet first';
            return;
        }

        // Check for pending redemption
        const redeemBalance = await this.services.contractService.getRedeemCollateralBalance(
            account,
            collateralIndex
        );

        if (redeemBalance > 0n) {
            button.textContent = 'Collect Redemption';
            return;
        }

        // Check approval status
        const approvalStatus = await this.services.transactionService.getRedeemApprovalStatus(account, amount);

        if (approvalStatus.needsApproval) {
            button.textContent = 'Approve UUSD';
        } else {
            button.textContent = 'Redeem UUSD';
        }
    }

    /**
     * Handle redeem form submission
     */
    async handleSubmit(event: Event): Promise<void> {
        event.preventDefault();

        if (!this.services.walletService.isConnected()) {
            this.services.notificationManager.showError('redeem', 'Please connect wallet first');
            return;
        }

        try {
            const amountInput = document.getElementById('redeemAmount') as HTMLInputElement;

            if (!amountInput?.value) {
                this.services.notificationManager.showError('redeem', 'Please enter a valid amount');
                return;
            }

            const amount = parseEther(amountInput.value);

            console.log('Starting redeem transaction:', {
                amount: amountInput.value,
                collateralIndex: LUSD_COLLATERAL.index
            });

            await this.services.transactionService.executeRedeem({
                collateralIndex: LUSD_COLLATERAL.index,
                dollarAmount: amount
            });

        } catch (error: any) {
            console.error('Redeem transaction failed:', error);

            // Re-enable the button and show error
            const button = document.getElementById('redeemButton') as HTMLButtonElement;
            if (button) {
                button.disabled = false;
                // Reset button text based on current state
                this.updateOutput();
            }

            // Show error message to user
            const errorMessage = error.message || 'Transaction failed. Please try again.';
            this.services.notificationManager.showError('redeem', errorMessage);
        }
    }

    /**
     * Handle transaction start
     */
    handleTransactionStart(): void {
        const button = document.getElementById('redeemButton') as HTMLButtonElement;
        if (button) {
            button.disabled = true;
            button.innerHTML = `Redeeming...<span class="loading"></span>`;
        }
    }

    /**
     * Handle transaction success
     */
    handleTransactionSuccess(operation: string): void {
        const button = document.getElementById('redeemButton') as HTMLButtonElement;
        const amountInput = document.getElementById('redeemAmount') as HTMLInputElement;

        if (button) {
            button.disabled = false;
        }

        if (operation === TransactionOperation.REDEEM && amountInput) {
            this.services.notificationManager.showSuccess('redeem', `Successfully redeemed ${amountInput.value} UUSD! Collect your redemption to receive tokens.`);
            amountInput.value = '';
            this.updateOutput();
        } else if (operation === TransactionOperation.COLLECT_REDEMPTION) {
            this.services.notificationManager.showSuccess('redeem', 'Successfully collected redemption!');
            this.updateOutput();
        }
    }

    /**
     * Handle transaction error
     */
    handleTransactionError(error: Error): void {
        const button = document.getElementById('redeemButton') as HTMLButtonElement;
        if (button) {
            button.disabled = false;
        }

        this.services.notificationManager.showError('redeem', error.message);
    }

    /**
     * Handle approval needed event
     */
    handleApprovalNeeded(tokenSymbol: string): void {
        const button = document.getElementById('redeemButton') as HTMLButtonElement;
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
     * Check for pending redemptions and notify user
     */
    async checkForPendingRedemptions(account: Address): Promise<void> {
        const pendingCollateral = await this.services.transactionService.checkForPendingRedemptions(account);

        if (pendingCollateral) {
            this.services.notificationManager.showSuccess('redeem', `You have a pending redemption for ${pendingCollateral.name}. Switch to the Redeem tab to collect.`);
        }
    }

    /**
     * Reset form to initial state
     */
    resetForm(): void {
        const amountInput = document.getElementById('redeemAmount') as HTMLInputElement;

        if (amountInput) amountInput.value = '';

        const redeemOutput = document.getElementById('redeemOutput');
        if (redeemOutput) redeemOutput.style.display = 'none';

        this.services.notificationManager.clearNotifications('redeem');
    }

    /**
     * Update wallet connection state
     */
    updateWalletConnection(isConnected: boolean): void {
        const button = document.getElementById('redeemButton') as HTMLButtonElement;
        if (button) {
            button.disabled = !isConnected;
            if (!isConnected) {
                button.textContent = 'Connect wallet first';
            } else {
                this.updateOutput();
            }
        }
    }
}
