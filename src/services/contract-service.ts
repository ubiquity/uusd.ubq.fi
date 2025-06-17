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

        const hash = await walletClient.writeContract({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: 'approve',
            args: [spender, amount],
            account,
            chain: walletClient.chain
        });

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

        const hash = await walletClient.writeContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'mintDollar',
            args: [
                BigInt(collateralIndex),
                dollarAmount,
                dollarOutMin,
                maxCollateralIn,
                maxGovernanceIn,
                isOneToOne
            ],
            account,
            chain: walletClient.chain
        });

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

        const hash = await walletClient.writeContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'redeemDollar',
            args: [
                BigInt(collateralIndex),
                dollarAmount,
                governanceOutMin,
                collateralOutMin
            ],
            account,
            chain: walletClient.chain
        });

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
