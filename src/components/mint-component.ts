import { parseEther, formatEther, formatUnits, type Address } from 'viem';
import type { WalletService } from '../services/wallet-service.ts';
import type { ContractService } from '../services/contract-service.ts';
import type { PriceService } from '../services/price-service.ts';
import type { TransactionService, TransactionOperation } from '../services/transaction-service.ts';
import type { CollateralOption } from '../services/contract-service.ts';
import { isEmptyFormState } from '../utils/validation-utils.ts';
import type { NotificationManager } from './notification-manager.ts';

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
        const collateralSelect = document.getElementById('collateralSelect') as HTMLSelectElement;
        const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;

        mintAmount?.addEventListener('input', () => this.updateOutput());
        collateralSelect?.addEventListener('change', () => this.updateOutput());
        forceCollateralOnly?.addEventListener('change', () => this.updateOutput());
    }

    /**
     * Populate the collateral dropdown with available options
     */
    populateCollateralDropdown(): void {
        const select = document.getElementById('collateralSelect') as HTMLSelectElement;
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
     * Update mint output based on current form values
     */
    async updateOutput(): Promise<void> {
        try {
            const amountInput = document.getElementById('mintAmount') as HTMLInputElement;
            const collateralSelect = document.getElementById('collateralSelect') as HTMLSelectElement;
            const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;

            const amount = amountInput.value;
            const collateralIndex = collateralSelect.value;

            if (isEmptyFormState(amount, collateralIndex)) {
                document.getElementById('mintOutput')!.style.display = 'none';
                document.getElementById('mintButton')!.textContent = 'Enter amount to continue';
                return;
            }

            document.getElementById('mintOutput')!.style.display = 'block';

            const dollarAmount = parseEther(amount);
            const isForceCollateralOnly = forceCollateralOnly.checked;

            // Calculate mint output using price service
            const result = await this.services.priceService.calculateMintOutput({
                dollarAmount,
                collateralIndex: parseInt(collateralIndex),
                isForceCollateralOnly
            });

            // Update UI
            document.getElementById('collateralNeeded')!.textContent =
                `${formatUnits(result.collateralNeeded, 18 - result.collateral.missingDecimals)} ${result.collateral.name}`;
            document.getElementById('ubqNeeded')!.textContent =
                `${formatEther(result.governanceNeeded)} UBQ`;
            document.getElementById('mintingFee')!.textContent =
                `${result.collateral.mintingFee}%`;
            document.getElementById('totalMinted')!.textContent =
                `${formatEther(result.totalDollarMint)} UUSD`;

            // Update button text based on approval status
            if (this.services.walletService.isConnected()) {
                await this.updateButton(result.collateral, result);
            }
        } catch (error) {
            console.error('Error updating mint output:', error);
        }
    }

    /**
     * Update mint button text based on approval status
     */
    private async updateButton(collateral: CollateralOption, result: any): Promise<void> {
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
            const collateralSelect = document.getElementById('collateralSelect') as HTMLSelectElement;
            const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;

            const amount = parseEther(amountInput.value);
            const collateralIndex = parseInt(collateralSelect.value);

            await this.services.transactionService.executeMint({
                collateralIndex,
                dollarAmount: amount,
                isForceCollateralOnly: forceCollateralOnly.checked
            });

        } catch (error: any) {
            // Error handling is done by service event handlers
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
        const collateralSelect = document.getElementById('collateralSelect') as HTMLSelectElement;
        const forceCollateralOnly = document.getElementById('forceCollateralOnly') as HTMLInputElement;

        if (amountInput) amountInput.value = '';
        if (collateralSelect) collateralSelect.value = '';
        if (forceCollateralOnly) forceCollateralOnly.checked = false;

        document.getElementById('mintOutput')!.style.display = 'none';
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
}