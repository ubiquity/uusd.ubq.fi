import { parseEther, formatEther, formatUnits, type Address } from 'viem';
import type { WalletService } from '../services/wallet-service.ts';
import type { ContractService } from '../services/contract-service.ts';
import type { PriceService } from '../services/price-service.ts';
import type { TransactionService } from '../services/transaction-service.ts';
import { TransactionOperation } from '../services/transaction-service.ts';
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
        const redeemCollateralSelect = document.getElementById('redeemCollateralSelect') as HTMLSelectElement;

        redeemAmount?.addEventListener('input', () => this.updateOutput());
        redeemCollateralSelect?.addEventListener('change', () => this.updateOutput());
    }

    /**
     * Populate the collateral dropdown with available options
     */
    populateCollateralDropdown(): void {
        const select = document.getElementById('redeemCollateralSelect') as HTMLSelectElement;
        if (!select) return;

        const collaterals = this.services.priceService.getCollateralOptions();
        select.innerHTML = '<option value="">Select a collateral</option>';

        collaterals.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.index.toString();
            opt.textContent = option.name;
            select.appendChild(opt);
        });
    }

    /**
     * Update redeem output based on current form values
     */
    async updateOutput(): Promise<void> {
        try {
            const amountInput = document.getElementById('redeemAmount') as HTMLInputElement;
            const collateralSelect = document.getElementById('redeemCollateralSelect') as HTMLSelectElement;

            const amount = amountInput.value;
            const collateralIndex = collateralSelect.value;

            if (!amount || !collateralIndex) {
                document.getElementById('redeemOutput')!.style.display = 'none';
                document.getElementById('redeemButton')!.textContent = 'Enter amount to continue';
                return;
            }

            document.getElementById('redeemOutput')!.style.display = 'block';

            const dollarAmount = parseEther(amount);

            // Calculate redeem output using price service
            const result = await this.services.priceService.calculateRedeemOutput({
                dollarAmount,
                collateralIndex: parseInt(collateralIndex)
            });

            // Update UI
            document.getElementById('collateralRedeemed')!.textContent =
                `${formatUnits(result.collateralRedeemed, 18 - result.collateral.missingDecimals)} ${result.collateral.name}`;
            document.getElementById('ubqRedeemed')!.textContent =
                `${formatEther(result.governanceRedeemed)} UBQ`;
            document.getElementById('redemptionFee')!.textContent =
                `${result.collateral.redemptionFee * 100}%`;

            // Update button text
            if (this.services.walletService.isConnected()) {
                await this.updateButton(parseInt(collateralIndex), dollarAmount);
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
            const collateralSelect = document.getElementById('redeemCollateralSelect') as HTMLSelectElement;

            const amount = parseEther(amountInput.value);
            const collateralIndex = parseInt(collateralSelect.value);

            await this.services.transactionService.executeRedeem({
                collateralIndex,
                dollarAmount: amount
            });

        } catch (error: any) {
            // Error handling is done by service event handlers
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
        const collateralSelect = document.getElementById('redeemCollateralSelect') as HTMLSelectElement;

        if (amountInput) amountInput.value = '';
        if (collateralSelect) collateralSelect.value = '';

        document.getElementById('redeemOutput')!.style.display = 'none';
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