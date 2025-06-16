import { parseEther, type Address, maxUint256 } from 'viem';
import { ADDRESSES } from '../contracts/constants.ts';
import { validateTransactionParams } from '../utils/validation-utils.ts';
import { formatLoadingButtonText } from '../utils/format-utils.ts';
import type { WalletService } from './wallet-service.ts';
import type { ContractService, CollateralOption } from './contract-service.ts';
import type { PriceService, MintPriceResult, RedeemPriceResult } from './price-service.ts';

/**
 * Interface for transaction execution events
 */
export interface TransactionEvents {
    onTransactionStart?: (operation: string) => void;
    onTransactionSuccess?: (operation: string, hash: string) => void;
    onTransactionError?: (operation: string, error: Error) => void;
    onApprovalNeeded?: (tokenSymbol: string) => void;
    onApprovalComplete?: (tokenSymbol: string) => void;
}

/**
 * Interface for mint transaction parameters
 */
export interface MintTransactionParams {
    collateralIndex: number;
    dollarAmount: bigint;
    isForceCollateralOnly: boolean;
}

/**
 * Interface for redeem transaction parameters
 */
export interface RedeemTransactionParams {
    collateralIndex: number;
    dollarAmount: bigint;
}

/**
 * Enum for transaction operation types
 */
export enum TransactionOperation {
    MINT = 'mint',
    REDEEM = 'redeem',
    COLLECT_REDEMPTION = 'collect_redemption',
    APPROVE_COLLATERAL = 'approve_collateral',
    APPROVE_GOVERNANCE = 'approve_governance',
    APPROVE_DOLLAR = 'approve_dollar'
}

/**
 * Service responsible for orchestrating multi-step transaction flows
 */
export class TransactionService {
    private walletService: WalletService;
    private contractService: ContractService;
    private priceService: PriceService;
    private events: TransactionEvents = {};

    constructor(
        walletService: WalletService,
        contractService: ContractService,
        priceService: PriceService
    ) {
        this.walletService = walletService;
        this.contractService = contractService;
        this.priceService = priceService;
    }

    /**
     * Set event handlers for transaction events
     */
    setEventHandlers(events: TransactionEvents) {
        this.events = { ...this.events, ...events };
    }

    /**
     * Execute complete mint workflow with approval handling
     */
    async executeMint(params: MintTransactionParams): Promise<string> {
        const { collateralIndex, dollarAmount, isForceCollateralOnly } = params;

        // Validate wallet connection
        this.walletService.validateConnection();
        const account = this.walletService.getAccount()!;

        // Validate transaction parameters
        const validation = validateTransactionParams(dollarAmount, collateralIndex, account);
        if (!validation.isValid) {
            throw new Error(validation.error);
        }

        try {
            this.events.onTransactionStart?.(TransactionOperation.MINT);

            // Get collateral info and calculate mint amounts
            const collateral = this.priceService.getCollateralByIndex(collateralIndex);
            if (!collateral) {
                throw new Error(`Collateral with index ${collateralIndex} not found`);
            }

            const mintResult = await this.priceService.calculateMintOutput({
                dollarAmount,
                collateralIndex,
                isForceCollateralOnly
            });

            // Handle approvals if needed
            await this.handleMintApprovals(collateral, account, mintResult);

            // Execute mint transaction
            const hash = await this.contractService.mintDollar(
                collateralIndex,
                dollarAmount,
                0n, // dollarOutMin
                maxUint256, // maxCollateralIn
                maxUint256, // maxGovernanceIn
                isForceCollateralOnly
            );

            this.events.onTransactionSuccess?.(TransactionOperation.MINT, hash);
            return hash;

        } catch (error) {
            this.events.onTransactionError?.(TransactionOperation.MINT, error as Error);
            throw error;
        }
    }

    /**
     * Execute complete redeem workflow with approval handling
     */
    async executeRedeem(params: RedeemTransactionParams): Promise<string> {
        const { collateralIndex, dollarAmount } = params;

        // Validate wallet connection
        this.walletService.validateConnection();
        const account = this.walletService.getAccount()!;

        // Validate transaction parameters
        const validation = validateTransactionParams(dollarAmount, collateralIndex, account);
        if (!validation.isValid) {
            throw new Error(validation.error);
        }

        try {
            this.events.onTransactionStart?.(TransactionOperation.REDEEM);

            // Check if there's a pending redemption to collect first
            const redeemBalance = await this.contractService.getRedeemCollateralBalance(
                account,
                collateralIndex
            );

            if (redeemBalance > 0n) {
                // Collect existing redemption first
                return this.executeCollectRedemption(collateralIndex);
            }

            // Handle UUSD approval if needed
            await this.handleRedeemApproval(account, dollarAmount);

            // Execute redeem transaction
            const hash = await this.contractService.redeemDollar(
                collateralIndex,
                dollarAmount,
                0n, // governanceOutMin
                0n  // collateralOutMin
            );

            this.events.onTransactionSuccess?.(TransactionOperation.REDEEM, hash);
            return hash;

        } catch (error) {
            this.events.onTransactionError?.(TransactionOperation.REDEEM, error as Error);
            throw error;
        }
    }

    /**
     * Execute collect redemption transaction
     */
    async executeCollectRedemption(collateralIndex: number): Promise<string> {
        // Validate wallet connection
        this.walletService.validateConnection();

        try {
            this.events.onTransactionStart?.(TransactionOperation.COLLECT_REDEMPTION);

            const hash = await this.contractService.collectRedemption(collateralIndex);

            this.events.onTransactionSuccess?.(TransactionOperation.COLLECT_REDEMPTION, hash);
            return hash;

        } catch (error) {
            this.events.onTransactionError?.(TransactionOperation.COLLECT_REDEMPTION, error as Error);
            throw error;
        }
    }

    /**
     * Check if user has pending redemption for any collateral
     */
    async checkForPendingRedemptions(account: Address): Promise<CollateralOption | null> {
        const collaterals = this.priceService.getCollateralOptions();

        for (const collateral of collaterals) {
            const balance = await this.contractService.getRedeemCollateralBalance(
                account,
                collateral.index
            );

            if (balance > 0n) {
                return collateral;
            }
        }

        return null;
    }

    /**
     * Get required approvals for mint operation
     */
    async getMintApprovalStatus(
        collateral: CollateralOption,
        account: Address,
        mintResult: MintPriceResult
    ): Promise<{
        needsCollateralApproval: boolean;
        needsGovernanceApproval: boolean;
        collateralAllowance: bigint;
        governanceAllowance: bigint;
    }> {
        const { collateralAllowance, governanceAllowance } =
            await this.contractService.checkMintAllowances(
                collateral.address,
                account,
                mintResult.collateralNeeded,
                mintResult.governanceNeeded
            );

        return {
            needsCollateralApproval: mintResult.collateralNeeded > 0n && collateralAllowance < mintResult.collateralNeeded,
            needsGovernanceApproval: mintResult.governanceNeeded > 0n && governanceAllowance < mintResult.governanceNeeded,
            collateralAllowance,
            governanceAllowance
        };
    }

    /**
     * Get required approval for redeem operation
     */
    async getRedeemApprovalStatus(account: Address, amount: bigint): Promise<{
        needsApproval: boolean;
        allowance: bigint;
    }> {
        const allowance = await this.contractService.checkRedeemAllowance(account, amount);

        return {
            needsApproval: amount > 0n && allowance < amount,
            allowance
        };
    }

    /**
     * Handle mint approvals sequentially
     */
    private async handleMintApprovals(
        collateral: CollateralOption,
        account: Address,
        mintResult: MintPriceResult
    ): Promise<void> {
        const approvalStatus = await this.getMintApprovalStatus(collateral, account, mintResult);

        // Handle collateral approval first
        if (approvalStatus.needsCollateralApproval) {
            this.events.onApprovalNeeded?.(collateral.name);

            await this.contractService.approveToken(
                collateral.address,
                ADDRESSES.DIAMOND,
                maxUint256
            );

            this.events.onApprovalComplete?.(collateral.name);
        }

        // Then handle governance approval
        if (approvalStatus.needsGovernanceApproval) {
            this.events.onApprovalNeeded?.('UBQ');

            await this.contractService.approveToken(
                ADDRESSES.GOVERNANCE,
                ADDRESSES.DIAMOND,
                maxUint256
            );

            this.events.onApprovalComplete?.('UBQ');
        }
    }

    /**
     * Handle redeem approval
     */
    private async handleRedeemApproval(account: Address, amount: bigint): Promise<void> {
        const approvalStatus = await this.getRedeemApprovalStatus(account, amount);

        if (approvalStatus.needsApproval) {
            this.events.onApprovalNeeded?.('UUSD');

            await this.contractService.approveToken(
                ADDRESSES.DOLLAR,
                ADDRESSES.DIAMOND,
                maxUint256
            );

            this.events.onApprovalComplete?.('UUSD');
        }
    }
}