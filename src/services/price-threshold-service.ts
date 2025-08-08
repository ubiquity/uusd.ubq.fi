import { createPublicClient, http, type Address, toHex, hexToBigInt, type PublicClient } from 'viem';
import { mainnet } from 'viem/chains';
import { ADDRESSES, PRICE_THRESHOLD_CONFIG } from '../contracts/constants.ts';

/**
 * Interface for price thresholds
 */
export interface PriceThresholds {
    mintThreshold: bigint;
    redeemThreshold: bigint;
    lastUpdated: number;
}

/**
 * Service for reading price thresholds ONLY from live contract storage
 * NO FALLBACKS - will fail if storage cannot be read
 */
export class PriceThresholdService {
    private client: PublicClient;
    private cache: PriceThresholds | null = null;
    private lastCacheTime = 0;

    constructor(rpcUrl?: string) {
        this.client = createPublicClient({
            chain: mainnet,
            transport: http(rpcUrl || 'https://mainnet.gateway.tenderly.co')
        });
    }

    /**
     * Get price thresholds ONLY from live contract storage (with caching)
     * NO FALLBACKS - will throw if cannot read from storage
     */
    async getPriceThresholds(): Promise<PriceThresholds> {
        const now = Date.now();

        // Return cached values if still valid
        if (this.cache && (now - this.lastCacheTime) < PRICE_THRESHOLD_CONFIG.CACHE_DURATION) {
            return this.cache;
        }

        // Read from storage - no fallbacks allowed
        const thresholds = await this.readThresholdsFromStorage();

        this.cache = {
            ...thresholds,
            lastUpdated: now
        };
        this.lastCacheTime = now;
        return this.cache;
    }

    /**
     * Force refresh the cache by reading from storage
     */
    async refreshThresholds(): Promise<PriceThresholds> {
        this.cache = null;
        this.lastCacheTime = 0;
        return this.getPriceThresholds();
    }

    /**
     * Get cached thresholds immediately (synchronous)
     * Returns null if no cache available
     */
    getCachedThresholds(): PriceThresholds | null {
        const now = Date.now();

        if (this.cache && (now - this.lastCacheTime) < PRICE_THRESHOLD_CONFIG.CACHE_DURATION) {
            return this.cache;
        }

        return null;
    }

    /**
     * Read thresholds from exact contract storage slots
     * Based on UbiquityPoolStorage struct layout analysis
     */
    private async readThresholdsFromStorage(): Promise<{ mintThreshold: bigint; redeemThreshold: bigint }> {
        const { UBIQUITY_POOL_STORAGE_BASE } = PRICE_THRESHOLD_CONFIG;

        /*
         * UbiquityPoolStorage struct layout analysis:
         *
         * slot 0:  mapping(address => bool) isAmoMinterEnabled
         * slot 1:  address[] collateralAddresses
         * slot 2:  mapping(address => uint256) collateralIndex
         * slot 3:  address[] collateralPriceFeedAddresses
         * slot 4:  uint256[] collateralPriceFeedStalenessThresholds
         * slot 5:  uint256[] collateralPrices
         * slot 6:  uint256 collateralRatio
         * slot 7:  string[] collateralSymbols
         * slot 8:  mapping(address => bool) isCollateralEnabled
         * slot 9:  uint256[] missingDecimals
         * slot 10: uint256[] poolCeilings
         * slot 11: mapping(address => uint256) lastRedeemedBlock
         * slot 12: uint256 mintPriceThreshold    ← TARGET
         * slot 13: uint256 redeemPriceThreshold  ← TARGET
         */

        const mintThresholdSlot = UBIQUITY_POOL_STORAGE_BASE + 12n;
        const redeemThresholdSlot = UBIQUITY_POOL_STORAGE_BASE + 13n;

        // Read both values in parallel
        const [mintThreshold, redeemThreshold] = await Promise.all([
            this.readStorageSlot(mintThresholdSlot),
            this.readStorageSlot(redeemThresholdSlot)
        ]);

        // Validate that we got reasonable values
        if (mintThreshold === 0n || redeemThreshold === 0n) {
            throw new Error(`Invalid price thresholds read from storage: mint=${mintThreshold}, redeem=${redeemThreshold}`);
        }

        if (!this.isValidThreshold(mintThreshold) || !this.isValidThreshold(redeemThreshold)) {
            throw new Error(`Price thresholds out of valid range: mint=${mintThreshold}, redeem=${redeemThreshold}`);
        }

        return { mintThreshold, redeemThreshold };
    }

    /**
     * Read a storage slot value
     */
    private async readStorageSlot(slot: bigint): Promise<bigint> {
        try {
            const storageValue = await this.client.getStorageAt({
                address: ADDRESSES.DIAMOND,
                slot: toHex(slot)
            });

            if (!storageValue) {
                throw new Error(`Empty storage value at slot ${toHex(slot)}`);
            }

            return hexToBigInt(storageValue);
        } catch (error) {
            throw new Error(`Failed to read storage slot ${toHex(slot)}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Check if a value looks like a valid price threshold
     */
    private isValidThreshold(value: bigint): boolean {
        const { MIN_VALID_THRESHOLD, MAX_VALID_THRESHOLD } = PRICE_THRESHOLD_CONFIG;
        return value >= MIN_VALID_THRESHOLD && value <= MAX_VALID_THRESHOLD;
    }

    /**
     * Clear the cache
     */
    clearCache(): void {
        this.cache = null;
        this.lastCacheTime = 0;
    }
}
