import { parseEther } from 'viem';
import {
    calculateMintAmounts,
    calculateRedeemAmounts,
    calculateDollarForCollateral,
    calculateRedeemFeeOutput,
    type MintCalculationInput,
    type RedeemCalculationInput,
    type MintCalculationOutput,
    type RedeemCalculationOutput
} from '../utils/calculation-utils.ts';
import type { ContractService, CollateralOption } from './contract-service.ts';
import { LUSD_COLLATERAL } from '../contracts/constants.ts';
import { PriceHistoryService, type PriceDataPoint } from './price-history-service.ts';

/**
 * Interface for price calculation parameters
 */
export interface PriceCalculationParams {
    dollarAmount: bigint;
    collateralIndex: number;
    isForceCollateralOnly?: boolean;
}

/**
 * Interface for mint price calculation result
 */
export interface MintPriceResult extends MintCalculationOutput {
    collateral: CollateralOption;
    collateralRatio: bigint;
    governancePrice: bigint;
}

/**
 * Interface for redeem price calculation result
 */
export interface RedeemPriceResult extends RedeemCalculationOutput {
    collateral: CollateralOption;
    collateralRatio: bigint;
    governancePrice: bigint;
}

/**
 * Cache entry for blockchain data
 */
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * Service responsible for price calculations and contract price data
 */
export class PriceService {
    private contractService: ContractService;
    private priceHistoryService: PriceHistoryService;
    private collateralOptions: CollateralOption[] = [];
    private cache = new Map<string, CacheEntry<any>>();
    private initialized = false;

    constructor(contractService: ContractService, walletService?: any) {
        this.contractService = contractService;
        // Create a new WalletService if not provided - we'll fix this in app.ts
        this.priceHistoryService = new PriceHistoryService(walletService || contractService);
    }

    /**
     * Initialize service by loading collateral options
     */
    async initialize(): Promise<void> {
        if (this.initialized) return;
        this.collateralOptions = await this.contractService.loadCollateralOptions();
        this.initialized = true;
    }

    /**
     * Check if service has been initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    /**
     * Get collateral options
     */
    getCollateralOptions(): CollateralOption[] {
        return this.collateralOptions;
    }

    /**
     * Get collateral option by index
     */
    getCollateralByIndex(index: number): CollateralOption | undefined {
        // Use hardcoded LUSD for index 0 to avoid race condition
        if (index === 0) {
            return LUSD_COLLATERAL;
        }
        return this.collateralOptions.find(c => c.index === index);
    }

    /**
     * Calculate mint output with real-time blockchain data
     */
    async calculateMintOutput(params: PriceCalculationParams): Promise<MintPriceResult> {
        const { dollarAmount, collateralIndex, isForceCollateralOnly = false } = params;

        // Use hardcoded LUSD for index 0 to avoid race condition
        let collateral: CollateralOption;
        if (collateralIndex === 0) {
            collateral = LUSD_COLLATERAL;
        } else {
            const dynamicCollateral = this.getCollateralByIndex(collateralIndex);
            if (!dynamicCollateral) {
                throw new Error(`Collateral with index ${collateralIndex} not found`);
            }
            collateral = dynamicCollateral;
        }

        // Use optimized batch fetch for blockchain data
        const batchData = await this.contractService.batchFetchMintData(collateralIndex, dollarAmount);
        const { collateralRatio, governancePrice } = batchData;

        // Calculate final collateral amount based on ratio mode - optimize to avoid extra RPC calls
        const collateralAmount = this.calculateCollateralAmountForMint(
            batchData.collateralAmount,
            dollarAmount,
            collateralRatio,
            isForceCollateralOnly
        );

        // Use pure calculation function
        const calculationInput: MintCalculationInput = {
            dollarAmount,
            collateralRatio,
            governancePrice,
            collateralAmount,
            mintingFee: collateral.mintingFee,
            isForceCollateralOnly
        };

        const result = calculateMintAmounts(calculationInput);

        return {
            ...result,
            collateral,
            collateralRatio,
            governancePrice
        };
    }

    /**
     * Calculate redeem output with real-time blockchain data
     */
    async calculateRedeemOutput(params: PriceCalculationParams): Promise<RedeemPriceResult> {
        const { dollarAmount, collateralIndex } = params;

        // Use hardcoded LUSD for index 0 to avoid race condition
        let collateral: CollateralOption;
        if (collateralIndex === 0) {
            collateral = LUSD_COLLATERAL;
        } else {
            const dynamicCollateral = this.getCollateralByIndex(collateralIndex);
            if (!dynamicCollateral) {
                throw new Error(`Collateral with index ${collateralIndex} not found`);
            }
            collateral = dynamicCollateral;
        }

        // Get current blockchain prices
        const [collateralRatio, governancePrice] = await Promise.all([
            this.contractService.getCollateralRatio(),
            this.contractService.getGovernancePrice()
        ]);

        // Get collateral amount based on fee-adjusted dollar amount
        const dollarAfterFee = calculateRedeemFeeOutput(dollarAmount, collateral.redemptionFee);
        const collateralAmount = await this.contractService.getDollarInCollateral(
            collateralIndex,
            dollarAfterFee
        );

        // Use pure calculation function
        const calculationInput: RedeemCalculationInput = {
            dollarAmount,
            collateralRatio,
            governancePrice,
            collateralAmount,
            redemptionFee: collateral.redemptionFee
        };

        const result = calculateRedeemAmounts(calculationInput);

        return {
            ...result,
            collateral,
            collateralRatio,
            governancePrice
        };
    }

    /**
     * Get current collateral ratio from blockchain
     */
    async getCurrentCollateralRatio(): Promise<bigint> {
        return this.contractService.getCollateralRatio();
    }

    /**
     * Get current governance price from blockchain
     */
    async getCurrentGovernancePrice(): Promise<bigint> {
        return this.contractService.getGovernancePrice();
    }

    /**
     * Check if system is in 100% collateral mode
     */
    async isFullCollateralMode(): Promise<boolean> {
        const ratio = await this.getCurrentCollateralRatio();
        const poolPricePrecision = 1000000n;
        return ratio >= poolPricePrecision;
    }

    /**
     * Check if system is in 100% governance mode
     */
    async isFullGovernanceMode(): Promise<boolean> {
        const ratio = await this.getCurrentCollateralRatio();
        return ratio === 0n;
    }

    /**
     * Calculate collateral amount for mint operation using pre-fetched data to avoid extra RPC calls
     */
    private calculateCollateralAmountForMint(
        fullCollateralAmount: bigint,
        dollarAmount: bigint,
        collateralRatio: bigint,
        isForceCollateralOnly: boolean
    ): bigint {
        const poolPricePrecision = 1000000n;

        if (isForceCollateralOnly || collateralRatio >= poolPricePrecision) {
            // 100% collateral mode - use the pre-fetched full amount
            return fullCollateralAmount;
        } else if (collateralRatio === 0n) {
            // 100% governance mode - no collateral needed
            return 0n;
        } else {
            // Mixed mode - calculate proportional amount based on collateral ratio
            const dollarForCollateral = calculateDollarForCollateral(dollarAmount, collateralRatio);
            // Calculate proportional collateral amount to avoid additional RPC call
            return (fullCollateralAmount * dollarForCollateral) / dollarAmount;
        }
    }

    /**
     * Get collateral amount needed for mint operation (legacy method for compatibility)
     */
    private async getCollateralAmountForMint(
        collateral: CollateralOption,
        dollarAmount: bigint,
        collateralRatio: bigint,
        isForceCollateralOnly: boolean
    ): Promise<bigint> {
        const poolPricePrecision = 1000000n;

        if (isForceCollateralOnly || collateralRatio >= poolPricePrecision) {
            // 100% collateral mode
            return this.contractService.getDollarInCollateral(collateral.index, dollarAmount);
        } else if (collateralRatio === 0n) {
            // 100% governance mode - no collateral needed
            return 0n;
        } else {
            // Mixed mode - get collateral for partial amount
            const dollarForCollateral = calculateDollarForCollateral(dollarAmount, collateralRatio);
            return this.contractService.getDollarInCollateral(collateral.index, dollarForCollateral);
        }
    }

    /**
     * Get current UUSD market price from blockchain
     */
    async getCurrentUUSDPrice(): Promise<string> {
        const rawPrice = await this.contractService.getDollarPriceUsd();
        // Convert raw price (6 decimal precision) to USD format
        const priceInUsd = Number(rawPrice) / 1000000;
        return `$${priceInUsd.toFixed(6)}`;
    }

    /**
     * Get UUSD price history for sparkline visualization
     */
    async getUUSDPriceHistory(): Promise<PriceDataPoint[]> {
        return this.priceHistoryService.getUUSDPriceHistory({
            maxDataPoints: 168,
            timeRangeHours: 168,
            sampleIntervalMinutes: 60
        });
    }

    /**
     * Get cached UUSD price history immediately (synchronous)
     */
    getCachedUUSDPriceHistory(): PriceDataPoint[] {
        return this.priceHistoryService.getCachedPriceHistory({
            maxDataPoints: 168,
            timeRangeHours: 168,
            sampleIntervalMinutes: 60
        });
    }

    /**
     * Clear price history cache (useful for refreshing data)
     */
    clearPriceHistoryCache(): void {
        this.priceHistoryService.clearCache();
    }

    /**
     * Refresh collateral options from blockchain
     */
    async refreshCollateralOptions(): Promise<void> {
        this.collateralOptions = await this.contractService.loadCollateralOptions();
    }
}
