import { parseEther as _parseEther, formatUnits } from "viem";
import {
  calculateMintAmounts,
  calculateRedeemAmounts,
  calculateDollarForCollateral,
  calculateRedeemFeeOutput,
  type MintCalculationInput,
  type RedeemCalculationInput,
  type MintCalculationOutput,
  type RedeemCalculationOutput,
} from "../utils/calculation-utils.ts";
import type { ContractService, CollateralOption } from "./contract-service.ts";
import { LUSD_COLLATERAL } from "../contracts/constants.ts";
import { PriceHistoryService, type PriceDataPoint } from "./price-history-service.ts";
import { PriceThresholdService, type PriceThresholds as _PriceThresholds } from "./price-threshold-service.ts";

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
  twapPrice: bigint;
  mintPriceThreshold: bigint;
  isMintingAllowed: boolean;
}

/**
 * Interface for redeem price calculation result
 */
export interface RedeemPriceResult extends RedeemCalculationOutput {
  collateral: CollateralOption;
  collateralRatio: bigint;
  governancePrice: bigint;
  twapPrice: bigint;
  redeemPriceThreshold: bigint;
  isRedeemingAllowed: boolean;
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
  private _contractService: ContractService;
  private _priceHistoryService: PriceHistoryService;
  private _priceThresholdService: PriceThresholdService;
  private _collateralOptions: CollateralOption[] = [];
  private _cache = new Map<string, CacheEntry<unknown>>();
  private _initialized = false;

  constructor(contractService: ContractService, walletService?: unknown) {
    this._contractService = contractService;
    // Create WalletService if not provided
    this._priceHistoryService = new PriceHistoryService((walletService as unknown) || contractService);
    this._priceThresholdService = new PriceThresholdService();
  }

  /**
   * Initialize service by loading collateral options
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;
    this._collateralOptions = await this._contractService.loadCollateralOptions();
    this._initialized = true;
  }

  /**
   * Check if service has been initialized
   */
  isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Get collateral options
   */
  getCollateralOptions(): CollateralOption[] {
    return this._collateralOptions;
  }

  /**
   * Get collateral option by index
   */
  getCollateralByIndex(index: number): CollateralOption | undefined {
    // Use hardcoded LUSD for index 0 to avoid race condition
    if (index === 0) {
      return LUSD_COLLATERAL;
    }
    return this._collateralOptions.find((c) => c.index === index);
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
    const batchData = await this._contractService.batchFetchMintData(collateralIndex, dollarAmount);
    const { collateralRatio, governancePrice } = batchData;

    // Get price thresholds dynamically from contract storage
    const priceThresholds = await this._priceThresholdService.getPriceThresholds();
    const twapPrice = await this._contractService.getLUSDOraclePrice();
    const mintPriceThreshold = priceThresholds.mintThreshold;

    // Calculate final collateral amount based on ratio mode - optimize to avoid extra RPC calls
    const collateralAmount = this._calculateCollateralAmountForMint(batchData.collateralAmount, dollarAmount, collateralRatio, isForceCollateralOnly);

    // Use pure calculation function
    const calculationInput: MintCalculationInput = {
      dollarAmount,
      collateralRatio,
      governancePrice,
      collateralAmount,
      mintingFee: collateral.mintingFee,
      isForceCollateralOnly,
    };

    const result = calculateMintAmounts(calculationInput);

    return {
      ...result,
      collateral,
      collateralRatio,
      governancePrice,
      twapPrice,
      mintPriceThreshold,
      isMintingAllowed: twapPrice >= mintPriceThreshold,
    };
  }

  /**
   * Calculate redeem output with real-time blockchain data
   */
  async calculateRedeemOutput(params: PriceCalculationParams, skipGovernancePrice: boolean = false): Promise<RedeemPriceResult> {
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

    // Prepare async calls - conditionally include governance price
    const asyncCalls: Promise<unknown>[] = [
      this._contractService.getCollateralRatio(),
      this._contractService.getLUSDOraclePrice(),
      this._priceThresholdService.getPriceThresholds(),
    ];

    // Only add governance price if not skipping (e.g., for LUSD-only redemptions)
    if (!skipGovernancePrice) {
      void asyncCalls.splice(1, 0, this._contractService.getGovernancePrice());
    }

    // Get current blockchain prices and thresholds
    const results = await Promise.all(asyncCalls);

    let collateralRatio: bigint;
    let governancePrice: bigint;
    let twapPrice: bigint;
    let priceThresholds: unknown;

    if (skipGovernancePrice) {
      [collateralRatio, twapPrice, priceThresholds] = results as [bigint, bigint, unknown];
      // Use a default governance price or fetch from cache if available
      governancePrice = 1000000n; // Default $1.00 as fallback
    } else {
      [collateralRatio, governancePrice, twapPrice, priceThresholds] = results as [bigint, bigint, bigint, unknown];
    }

    const redeemPriceThreshold = (priceThresholds as { redeemThreshold: bigint }).redeemThreshold;

    // Get collateral amount based on fee-adjusted dollar amount
    const dollarAfterFee = calculateRedeemFeeOutput(dollarAmount, collateral.redemptionFee);
    const collateralAmount = await this._contractService.getDollarInCollateral(collateralIndex, dollarAfterFee);

    // Use pure calculation function
    const calculationInput: RedeemCalculationInput = {
      dollarAmount,
      collateralRatio,
      governancePrice,
      collateralAmount,
      redemptionFee: collateral.redemptionFee,
    };

    const result = calculateRedeemAmounts(calculationInput);

    return {
      ...result,
      collateral,
      collateralRatio,
      governancePrice,
      twapPrice,
      redeemPriceThreshold,
      // Redemptions are allowed when TWAP is ABOVE the threshold
      // When TWAP < $1.00, redemptions are DISABLED
      isRedeemingAllowed: twapPrice >= redeemPriceThreshold,
    };
  }

  /**
   * Get current collateral ratio from blockchain
   */
  async getCurrentCollateralRatio(): Promise<bigint> {
    return this._contractService.getCollateralRatio();
  }

  /**
   * Get current governance price from blockchain
   */
  async getCurrentGovernancePrice(): Promise<bigint> {
    return this._contractService.getGovernancePrice();
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
  private _calculateCollateralAmountForMint(
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
  private async _getCollateralAmountForMint(
    collateral: CollateralOption,
    dollarAmount: bigint,
    collateralRatio: bigint,
    isForceCollateralOnly: boolean
  ): Promise<bigint> {
    const poolPricePrecision = 1000000n;

    if (isForceCollateralOnly || collateralRatio >= poolPricePrecision) {
      // 100% collateral mode
      return this._contractService.getDollarInCollateral(collateral.index, dollarAmount);
    } else if (collateralRatio === 0n) {
      // 100% governance mode - no collateral needed
      return 0n;
    } else {
      // Mixed mode - get collateral for partial amount
      const dollarForCollateral = calculateDollarForCollateral(dollarAmount, collateralRatio);
      return this._contractService.getDollarInCollateral(collateral.index, dollarForCollateral);
    }
  }

  /**
   * Get current UUSD market price from blockchain
   */
  async getCurrentUUSDPrice(): Promise<string> {
    const rawPrice = await this._contractService.getDollarPriceUsd();
    // Convert raw price (6 decimal precision) to USD format
    const priceInUsd = formatUnits(rawPrice, 6);
    return `$${parseFloat(priceInUsd).toFixed(6)}`;
  }

  /**
   * Get UUSD price history for sparkline visualization
   */
  async getUUSDPriceHistory(): Promise<PriceDataPoint[]> {
    return this._priceHistoryService.getUUSDPriceHistory({
      maxDataPoints: 168,
      timeRangeHours: 168,
      sampleIntervalMinutes: 60,
    });
  }

  /**
   * Get cached UUSD price history immediately (synchronous)
   */
  getCachedUUSDPriceHistory(): PriceDataPoint[] {
    return this._priceHistoryService.getCachedPriceHistory({
      maxDataPoints: 168,
      timeRangeHours: 168,
      sampleIntervalMinutes: 60,
    });
  }

  /**
   * Clear price history cache (useful for refreshing data)
   */
  clearPriceHistoryCache(): void {
    this._priceHistoryService.clearCache();
  }

  /**
   * Refresh collateral options from blockchain
   */
  async refreshCollateralOptions(): Promise<void> {
    this._collateralOptions = await this._contractService.loadCollateralOptions();
  }
}
