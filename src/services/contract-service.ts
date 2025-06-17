import {
    type Address,
    type PublicClient,
    type WalletClient,
    maxUint256,
    formatUnits
} from 'viem';
import { ADDRESSES, DIAMOND_ABI, ERC20_ABI } from '../contracts/constants.ts';
import type { CollateralInfo } from '../utils/calculation-utils.ts';
import type { WalletService } from './wallet-service.ts';
import { analyzeOracleError, getAlternativeActions, getOracleRefreshEstimate } from '../utils/oracle-utils.ts';

/**
 * Extended collateral information with blockchain state
 */
export interface CollateralOption extends CollateralInfo {
    isEnabled?: boolean;
    isMintPaused?: boolean;
    isRedeemPaused?: boolean;
}

/**
 * Interface for contract read operations
 */
export interface ContractReads {
    getCollateralRatio(): Promise<bigint>;
    getGovernancePrice(): Promise<bigint>;
    getDollarInCollateral(collateralIndex: number, dollarAmount: bigint): Promise<bigint>;
    getAllowance(tokenAddress: Address, owner: Address, spender: Address): Promise<bigint>;
    getRedeemCollateralBalance(userAddress: Address, collateralIndex: number): Promise<bigint>;
}

/**
 * Interface for contract write operations
 */
export interface ContractWrites {
    approveToken(tokenAddress: Address, spender: Address, amount: bigint): Promise<string>;
    mintDollar(
        collateralIndex: number,
        dollarAmount: bigint,
        dollarOutMin: bigint,
        maxCollateralIn: bigint,
        maxGovernanceIn: bigint,
        isOneToOne: boolean
    ): Promise<string>;
    redeemDollar(
        collateralIndex: number,
        dollarAmount: bigint,
        governanceOutMin: bigint,
        collateralOutMin: bigint
    ): Promise<string>;
    collectRedemption(collateralIndex: number): Promise<string>;
}

/**
 * Service responsible for all blockchain contract interactions
 */
export class ContractService implements ContractReads, ContractWrites {
    private walletService: WalletService;

    constructor(walletService: WalletService) {
        this.walletService = walletService;
    }

    /**
     * Load all available collateral options from the contract
     */
    async loadCollateralOptions(): Promise<CollateralOption[]> {
        const publicClient = this.walletService.getPublicClient();

        const addresses = await publicClient.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'allCollaterals'
        });

        const options = await Promise.all(
            (addresses as Address[]).map(async (address) => {
                const info = await publicClient.readContract({
                    address: ADDRESSES.DIAMOND,
                    abi: DIAMOND_ABI,
                    functionName: 'collateralInformation',
                    args: [address]
                }) as any;

                return {
                    index: Number(info.index),
                    name: info.symbol,
                    address: address,
                    mintingFee: Number(formatUnits(info.mintingFee, 6)),
                    redemptionFee: Number(formatUnits(info.redemptionFee, 6)),
                    missingDecimals: Number(info.missingDecimals),
                    isEnabled: info.isEnabled,
                    isMintPaused: info.isMintPaused,
                    isRedeemPaused: info.isRedeemPaused
                };
            })
        );

        return options.filter(o => o.isEnabled && !o.isMintPaused);
    }

    /**
     * Get current collateral ratio from the contract
     */
    async getCollateralRatio(): Promise<bigint> {
        const publicClient = this.walletService.getPublicClient();
        return await publicClient.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'collateralRatio'
        }) as bigint;
    }

    /**
     * Get current governance token price from the contract
     */
    async getGovernancePrice(): Promise<bigint> {
        const publicClient = this.walletService.getPublicClient();
        return await publicClient.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'getGovernancePriceUsd'
        }) as bigint;
    }

    /**
     * Get current UUSD market price from the contract
     */
    async getDollarPriceUsd(): Promise<bigint> {
        const publicClient = this.walletService.getPublicClient();
        return await publicClient.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'getDollarPriceUsd'
        }) as bigint;
    }

    /**
     * Get collateral amount needed for a given dollar amount
     */
    async getDollarInCollateral(collateralIndex: number, dollarAmount: bigint): Promise<bigint> {
        const publicClient = this.walletService.getPublicClient();
        return await publicClient.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'getDollarInCollateral',
            args: [BigInt(collateralIndex), dollarAmount]
        }) as bigint;
    }

    /**
     * Get token allowance for a specific owner and spender
     */
    async getAllowance(tokenAddress: Address, owner: Address, spender: Address): Promise<bigint> {
        const publicClient = this.walletService.getPublicClient();
        return await publicClient.readContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'allowance',
            args: [owner, spender]
        }) as bigint;
    }

    /**
     * Get pending redemption balance for a user and collateral
     */
    async getRedeemCollateralBalance(userAddress: Address, collateralIndex: number): Promise<bigint> {
        const publicClient = this.walletService.getPublicClient();
        return await publicClient.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'getRedeemCollateralBalance',
            args: [userAddress, BigInt(collateralIndex)]
        }) as bigint;
    }

    /**
     * Approve a token for spending by a spender
     */
    async approveToken(tokenAddress: Address, spender: Address, amount: bigint = maxUint256): Promise<string> {
        this.walletService.validateConnection();
        const walletClient = this.walletService.getWalletClient();
        const publicClient = this.walletService.getPublicClient();
        const account = this.walletService.getAccount()!;

        const args = [spender, amount];

        console.log('🔄 Estimating gas for approval transaction...');

        // Estimate gas with fallback handling
        let gasEstimate: bigint;
        try {
            gasEstimate = await publicClient.estimateContractGas({
                address: tokenAddress,
                abi: ERC20_ABI,
                functionName: 'approve',
                args,
                account
            });
            console.log('✅ Approval gas estimated:', gasEstimate.toString());
        } catch (estimationError) {
            console.log('⚠️ Approval gas estimation failed, using fallback:', estimationError);
            // Fallback gas limit for approval operations
            gasEstimate = 100000n;
        }

        // Add 20% buffer to gas estimate
        const gasLimit = gasEstimate + (gasEstimate * 20n / 100n);
        console.log('🔄 Using approval gas limit with buffer:', gasLimit.toString());

        const hash = await walletClient.writeContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args,
            account,
            chain: walletClient.chain,
            gas: gasLimit
        });

        console.log('✅ Approval transaction submitted:', hash);
        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
    }

    /**
     * Execute mint dollar transaction
     */
    async mintDollar(
        collateralIndex: number,
        dollarAmount: bigint,
        dollarOutMin: bigint = 0n,
        maxCollateralIn: bigint = maxUint256,
        maxGovernanceIn: bigint = maxUint256,
        isOneToOne: boolean = false
    ): Promise<string> {
        this.walletService.validateConnection();
        const walletClient = this.walletService.getWalletClient();
        const publicClient = this.walletService.getPublicClient();
        const account = this.walletService.getAccount()!;

        const args = [
            BigInt(collateralIndex),
            dollarAmount,
            dollarOutMin,
            maxCollateralIn,
            maxGovernanceIn,
            isOneToOne
        ];

        console.log('🔄 Estimating gas for mint transaction...');

        // Estimate gas with oracle error detection
        let gasEstimate: bigint;
        try {
            gasEstimate = await publicClient.estimateContractGas({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'mintDollar',
                args,
                account
            });
            console.log('✅ Gas estimated:', gasEstimate.toString());
        } catch (estimationError: any) {
            console.log('⚠️ Gas estimation failed:', estimationError);

            // Analyze oracle error with enhanced messaging
            const errorMessage = estimationError.message || estimationError.toString();
            const oracleAnalysis = analyzeOracleError(errorMessage);

            if (oracleAnalysis.isOracleIssue) {
                console.log('❌ Oracle data is stale, aborting transaction');
                const refreshEstimate = getOracleRefreshEstimate();
                const alternatives = getAlternativeActions();

                const enhancedMessage = [
                    oracleAnalysis.userMessage,
                    ...oracleAnalysis.suggestions,
                    '',
                    `🕒 ${refreshEstimate}`,
                    '',
                    'Alternative actions:',
                    ...alternatives
                ].join('\n');

                throw new Error(enhancedMessage);
            }

            // For other gas estimation failures, use fallback
            console.log('🔄 Using fallback gas limit for non-oracle error');
            gasEstimate = 500000n;
        }

        // Add 20% buffer to gas estimate
        const gasLimit = gasEstimate + (gasEstimate * 20n / 100n);
        console.log('🔄 Using gas limit with buffer:', gasLimit.toString());

        const hash = await walletClient.writeContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'mintDollar',
            args,
            account,
            chain: walletClient.chain,
            gas: gasLimit
        });

        console.log('✅ Mint transaction submitted:', hash);
        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
    }

    /**
     * Execute redeem dollar transaction
     */
    async redeemDollar(
        collateralIndex: number,
        dollarAmount: bigint,
        governanceOutMin: bigint = 0n,
        collateralOutMin: bigint = 0n
    ): Promise<string> {
        this.walletService.validateConnection();
        const walletClient = this.walletService.getWalletClient();
        const publicClient = this.walletService.getPublicClient();
        const account = this.walletService.getAccount()!;

        const args = [
            BigInt(collateralIndex),
            dollarAmount,
            governanceOutMin,
            collateralOutMin
        ];

        console.log('🔄 Estimating gas for redeem transaction...');

        // Estimate gas with oracle error detection
        let gasEstimate: bigint;
        try {
            gasEstimate = await publicClient.estimateContractGas({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'redeemDollar',
                args,
                account
            });
            console.log('✅ Redeem gas estimated:', gasEstimate.toString());
        } catch (estimationError: any) {
            console.log('⚠️ Redeem gas estimation failed:', estimationError);

            // Analyze error message for specific contract errors
            const errorMessage = estimationError.message || estimationError.toString();
            
            // Check for specific contract errors first
            if (errorMessage.includes('Dollar price too high')) {
                console.log('❌ Contract rejected redeem: Dollar price too high');
                throw new Error('Cannot redeem at this time: The current UUSD price is too high relative to collateral prices. This is a safety mechanism to protect the protocol. Please try again later when market conditions have stabilized.');
            }

            if (errorMessage.includes('Collateral disabled')) {
                console.log('❌ Contract rejected redeem: Collateral disabled');
                throw new Error('Redemptions are temporarily disabled for this collateral type. Please try again later or use a different collateral.');
            }

            if (errorMessage.includes('Insufficient collateral')) {
                console.log('❌ Contract rejected redeem: Insufficient collateral');
                throw new Error('Insufficient collateral in the protocol to fulfill this redemption. Please try a smaller amount.');
            }

            // Analyze oracle error with enhanced messaging
            const oracleAnalysis = analyzeOracleError(errorMessage);

            if (oracleAnalysis.isOracleIssue) {
                console.log('❌ Oracle data is stale, aborting redeem transaction');
                const refreshEstimate = getOracleRefreshEstimate();
                const alternatives = getAlternativeActions();

                const enhancedMessage = [
                    oracleAnalysis.userMessage,
                    ...oracleAnalysis.suggestions,
                    '',
                    `🕒 ${refreshEstimate}`,
                    '',
                    'Alternative actions:',
                    ...alternatives
                ].join('\n');

                throw new Error(enhancedMessage);
            }

            // For other gas estimation failures, use fallback
            console.log('🔄 Using fallback gas limit for non-oracle redeem error');
            gasEstimate = 400000n;
        }

        // Add 20% buffer to gas estimate
        const gasLimit = gasEstimate + (gasEstimate * 20n / 100n);
        console.log('🔄 Using redeem gas limit with buffer:', gasLimit.toString());

        const hash = await walletClient.writeContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'redeemDollar',
            args,
            account,
            chain: walletClient.chain,
            gas: gasLimit
        });

        console.log('✅ Redeem transaction submitted:', hash);
        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
    }

    /**
     * Collect pending redemption
     */
    async collectRedemption(collateralIndex: number): Promise<string> {
        this.walletService.validateConnection();
        const walletClient = this.walletService.getWalletClient();
        const publicClient = this.walletService.getPublicClient();
        const account = this.walletService.getAccount()!;

        const hash = await walletClient.writeContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'collectRedemption',
            args: [BigInt(collateralIndex)],
            account,
            chain: walletClient.chain
        });

        await publicClient.waitForTransactionReceipt({ hash });
        return hash;
    }

    /**
     * Check allowances for both collateral and governance tokens
     */
    async checkMintAllowances(
        collateralAddress: Address,
        account: Address,
        collateralNeeded: bigint,
        governanceNeeded: bigint
    ): Promise<{ collateralAllowance: bigint; governanceAllowance: bigint }> {
        const [collateralAllowance, governanceAllowance] = await Promise.all([
            collateralNeeded > 0n ?
                this.getAllowance(collateralAddress, account, ADDRESSES.DIAMOND) :
                maxUint256,
            governanceNeeded > 0n ?
                this.getAllowance(ADDRESSES.GOVERNANCE, account, ADDRESSES.DIAMOND) :
                maxUint256
        ]);

        return { collateralAllowance, governanceAllowance };
    }

    /**
     * Check UUSD allowance for redeem operations
     */
    async checkRedeemAllowance(account: Address, amount: bigint): Promise<bigint> {
        if (amount <= 0n) return maxUint256;
        return this.getAllowance(ADDRESSES.DOLLAR, account, ADDRESSES.DIAMOND);
    }
}
