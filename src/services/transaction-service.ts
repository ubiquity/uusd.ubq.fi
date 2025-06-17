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

        console.log('ExecuteMint called with params:', {
            collateralIndex,
            dollarAmount: dollarAmount.toString(),
            isForceCollateralOnly
        });

        // Validate wallet connection
        try {
            this.walletService.validateConnection();
            console.log('✅ Wallet connection validated');
        } catch (error) {
            console.error('❌ Wallet validation failed:', error);
            throw error;
        }

        const account = this.walletService.getAccount()!;
        console.log('✅ Account retrieved:', account);

        // Validate transaction parameters
        const validation = validateTransactionParams(dollarAmount, collateralIndex, account);
        if (!validation.isValid) {
            console.error('❌ Parameter validation failed:', validation.error);
            throw new Error(validation.error);
        }
        console.log('✅ Parameters validated');

        try {
            this.events.onTransactionStart?.(TransactionOperation.MINT);
            console.log('✅ Transaction start event fired');

            // Get collateral info and calculate mint amounts
            const collateral = this.priceService.getCollateralByIndex(collateralIndex);
            if (!collateral) {
                console.error('❌ Collateral not found for index:', collateralIndex);
                throw new Error(`Collateral with index ${collateralIndex} not found`);
            }
            console.log('✅ Collateral found:', collateral);

            console.log('🔄 Calculating mint output...');
            const mintResult = await this.priceService.calculateMintOutput({
                dollarAmount,
                collateralIndex,
                isForceCollateralOnly
            });
            console.log('✅ Mint calculation result:', {
                totalDollarMint: mintResult.totalDollarMint.toString(),
                collateralNeeded: mintResult.collateralNeeded.toString(),
                governanceNeeded: mintResult.governanceNeeded.toString()
            });

            // Handle approvals if needed
            console.log('🔄 Checking and handling approvals...');
            await this.handleMintApprovals(collateral, account, mintResult);
            console.log('✅ Approvals handled');

            // Execute mint transaction with slippage tolerance
            // Add 0.5% slippage tolerance
            const slippageBasisPoints = 50n; // 0.5%
            const basisPointsDivisor = 10000n;

            // Reduce minimum output by slippage amount
            const dollarOutMin = mintResult.totalDollarMint * (basisPointsDivisor - slippageBasisPoints) / basisPointsDivisor;

            // Increase maximum inputs by slippage amount
            const maxCollateralIn = mintResult.collateralNeeded * (basisPointsDivisor + slippageBasisPoints) / basisPointsDivisor;
            const maxGovernanceIn = mintResult.governanceNeeded * (basisPointsDivisor + slippageBasisPoints) / basisPointsDivisor;

            console.log('🔄 Executing mint transaction with params:', {
                collateralIndex,
                dollarAmount: dollarAmount.toString(),
                dollarOutMin: dollarOutMin.toString(),
                maxCollateralIn: maxCollateralIn.toString(),
                maxGovernanceIn: maxGovernanceIn.toString(),
                isForceCollateralOnly
            });

            // Check for oracle staleness before attempting transaction
            const errorMessage = '';
            try {
                const hash = await this.contractService.mintDollar(
                    collateralIndex,
                    dollarAmount,
                    dollarOutMin, // Minimum acceptable output (with slippage)
                    maxCollateralIn, // Maximum collateral to spend (with slippage)
                    maxGovernanceIn, // Maximum governance to spend (with slippage)
                    isForceCollateralOnly
                );

                console.log('✅ Mint transaction successful, hash:', hash);
                this.events.onTransactionSuccess?.(TransactionOperation.MINT, hash);
                return hash;

            } catch (contractError: any) {
                console.error('❌ Mint transaction failed:', contractError);

                // Check if this is a stale oracle data error
                if (contractError.message?.toLowerCase().includes('stale stable/usd data')) {
                    console.log('🔄 Oracle data is stale, suggesting retry...');
                    const oracleError = new Error(`Price oracle data is outdated. The LUSD price feed needs to be updated by oracle keepers. This usually resolves within a few minutes. Please try again later, or consider using a different collateral type if available.`);
                    this.events.onTransactionError?.(TransactionOperation.MINT, oracleError);
                    throw oracleError;
                }

                // Enhanced error handling with specific messages
                const enhancedError = this.enhanceErrorMessage(contractError, 'mint');
                this.events.onTransactionError?.(TransactionOperation.MINT, enhancedError);
                throw enhancedError;
            }

        } catch (error) {
            console.error('❌ General mint error:', error);
            // Re-throw if already processed
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

    /**
     * Enhance error messages for better user experience
     */
    private enhanceErrorMessage(error: Error, operation: string): Error {
        const errorMessage = error.message.toLowerCase();

        // Oracle/Price data errors (most specific first)
        if (errorMessage.includes('stale stable/usd data') || errorMessage.includes('stale') && errorMessage.includes('data')) {
            return new Error(`Price oracle data is outdated. The LUSD price feed needs to be updated before transactions can proceed. Please try again in a few minutes, or consider using a different collateral type if available.`);
        }

        // Gas-related errors
        if (errorMessage.includes('gas') || errorMessage.includes('out of gas')) {
            return new Error(`Transaction failed due to insufficient gas. This may be caused by high network congestion. Please try again with higher gas settings.`);
        }

        // Insufficient balance errors
        if (errorMessage.includes('insufficient') || errorMessage.includes('balance')) {
            return new Error(`Insufficient token balance for ${operation} operation. Please check your wallet balances.`);
        }

        // User rejection
        if (errorMessage.includes('rejected') || errorMessage.includes('denied') || errorMessage.includes('user rejected')) {
            return new Error(`Transaction was cancelled by user.`);
        }

        // Network errors
        if (errorMessage.includes('network') || errorMessage.includes('connection')) {
            return new Error(`Network connection error. Please check your internet connection and try again.`);
        }

        // Slippage errors
        if (errorMessage.includes('slippage') || errorMessage.includes('price') || errorMessage.includes('amount')) {
            return new Error(`Transaction failed due to price movement. Please try again with updated parameters.`);
        }

        // Generic contract errors
        if (errorMessage.includes('revert') || errorMessage.includes('execution reverted')) {
            return new Error(`Transaction failed: Smart contract rejected the operation. Please check your inputs and try again.`);
        }

        // Default enhanced message
        return new Error(`${operation.charAt(0).toUpperCase() + operation.slice(1)} transaction failed: ${error.message}`);
    }
}
