import { type Address, type PublicClient, type Log, parseEther } from "viem";
import type { WalletService } from "./wallet-service.ts";
import { RPCBatchService, type BatchRequestResult as _BatchRequestResult } from "./rpc-batch-service.ts";

/**
 * Historical price data point
 */
export interface PriceDataPoint {
  timestamp: number;
  price: bigint; // Price in 6 decimal precision (1000000 = $1.00)
  blockNumber: bigint;
}

/**
 * Configuration for price history queries
 */
export interface PriceHistoryConfig {
  maxDataPoints: number;
  timeRangeHours: number;
  sampleIntervalMinutes: number;
}

/**
 * Curve Pool TokenExchange event structure
 */
interface TokenExchangeEvent {
  buyer: Address;
  soldId: bigint;
  tokensSold: bigint;
  boughtId: bigint;
  tokensBought: bigint;
}

/**
 * Service for reconstructing UUSD price history from blockchain data
 */
export class PriceHistoryService {
  private _walletService: WalletService;
  private _rpcBatchService: RPCBatchService;
  private readonly _curvePoolAddress: Address = "0xcc68509f9ca0e1ed119eac7c468ec1b1c42f384f";
  private readonly _lusdIndex = 0n;
  private readonly _uusdIndex = 1n;

  // Curve pool TokenExchange event signature
  private readonly _tokenExchangeTopic = "0x8b3e96f2b889fa771c53c981b40daf005f63f637f1869f707052d15a3dd97140";

  private _cache: Map<string, PriceDataPoint[]> = new Map();
  private _pointCache: Map<string, { point: PriceDataPoint; timestamp: number }> = new Map(); // Block-level caching with timestamps
  private _cacheTimestamp: number = 0;
  private readonly _cacheTtlMs = 5 * 60 * 1000; // 5 minutes
  private readonly _pointCacheTtlMs = 30 * 60 * 1000; // 30 minutes for individual points

  constructor(walletService: WalletService) {
    this._walletService = walletService;
    this._rpcBatchService = new RPCBatchService();

    // Clean up old cache entries on initialization
    this._cleanupOldCache();
  }

  /**
   * Get UUSD price history for the specified time range
   */
  async getUUSDPriceHistory(
    config: PriceHistoryConfig = {
      maxDataPoints: 24,
      timeRangeHours: 24,
      sampleIntervalMinutes: 60,
    }
  ): Promise<PriceDataPoint[]> {
    const cacheKey = `${config.timeRangeHours}h_${config.maxDataPoints}pts`;

    // Check cache first
    if (this._isCacheValid(cacheKey)) {
      return this._cache.get(cacheKey) || [];
    }

    try {
      const publicClient = this._walletService.getPublicClient();
      const currentBlock = await publicClient.getBlockNumber();

      // Calculate block range for the time period
      const targetBlocks = this._calculateBlockRange(currentBlock, config.timeRangeHours);

      // Try multiple strategies for getting price history
      const priceHistory = await this._fetchPriceHistoryMultiStrategy(publicClient, targetBlocks, config);

      // Cache the result
      this._cache.set(cacheKey, priceHistory);
      this._cacheTimestamp = Date.now();

      return priceHistory;
    } catch (error) {
      console.error("❌ Failed to fetch price history:", error);
      return [];
    }
  }

  /**
   * Get cached price history immediately (synchronous)
   * Returns cached data instantly for immediate rendering
   */
  getCachedPriceHistory(
    config: PriceHistoryConfig = {
      maxDataPoints: 24,
      timeRangeHours: 24,
      sampleIntervalMinutes: 60,
    }
  ): PriceDataPoint[] {
    const cacheKey = `${config.timeRangeHours}h_${config.maxDataPoints}pts`;

    // Return cached data if available
    if (this._isCacheValid(cacheKey)) {
      return this._cache.get(cacheKey) || [];
    }

    // If no main cache, try to build from individual cached points
    return this._buildFromCachedPoints(config);
  }

  /**
   * Build price history from individual cached points
   */
  private _buildFromCachedPoints(config: PriceHistoryConfig): PriceDataPoint[] {
    const cachedPoints: PriceDataPoint[] = [];

    try {
      // Use estimated current block for cache key generation
      const estimatedCurrentBlock = BigInt(Date.now() / 12000); // Rough estimate
      const targetBlocks = this._calculateBlockRange(estimatedCurrentBlock, config.timeRangeHours);
      const blockRange = targetBlocks.toBlock - targetBlocks.fromBlock;
      const stepSize = blockRange / BigInt(config.maxDataPoints);

      // Check for cached individual points
      for (let i = 0; i < config.maxDataPoints; i++) {
        const targetBlock = targetBlocks.fromBlock + stepSize * BigInt(i);
        const quantizedBlock = this._quantizeToBlockBoundary(targetBlock, 300n);
        const pointKey = `hour_${quantizedBlock}`;
        const cachedPoint = this._getPointFromCache(pointKey);

        if (cachedPoint) {
          cachedPoints.push(cachedPoint);
        }
      }
    } catch {
      // Ignore errors in cache reconstruction
    }

    return cachedPoints.sort((a, b) => Number(a.blockNumber - b.blockNumber));
  }

  /**
   * Fetch price history using multiple strategies for robustness
   */
  private async _fetchPriceHistoryMultiStrategy(
    publicClient: PublicClient,
    targetBlocks: { fromBlock: bigint; toBlock: bigint },
    config: PriceHistoryConfig
  ): Promise<PriceDataPoint[]> {
    // Strategy 1: Try to get swap events from Curve pool
    try {
      const swapHistory = await this._fetchPriceFromSwapEvents(publicClient, targetBlocks, config);

      if (swapHistory.length > 0) {
        return swapHistory;
      }
    } catch (error) {
      console.warn("⚠️ Swap events strategy failed:", error);
    }

    // Strategy 2: Sample prices at regular intervals using get_dy calls
    try {
      const sampledHistory = await this._fetchPriceBySampling(publicClient, targetBlocks, config);

      if (sampledHistory.length > 0) {
        return sampledHistory;
      }
    } catch (error) {
      console.warn("⚠️ Sampling strategy failed:", error);
    }

    // Fallback: Return empty array
    console.warn("⚠️ All price history strategies failed");
    return [];
  }

  /**
   * Fetch price history from Curve pool swap events
   */
  private async _fetchPriceFromSwapEvents(
    _publicClient: PublicClient,
    _targetBlocks: { fromBlock: bigint; toBlock: bigint },
    _config: PriceHistoryConfig
  ): Promise<PriceDataPoint[]> {
    // Skip event log strategy due to complex ABI parsing

    return [];
  }

  /**
   * Fetch price history by sampling prices at regular intervals using intelligent caching
   */
  private async _fetchPriceBySampling(
    publicClient: PublicClient,
    targetBlocks: { fromBlock: bigint; toBlock: bigint },
    config: PriceHistoryConfig
  ): Promise<PriceDataPoint[]> {
    const blockRange = targetBlocks.toBlock - targetBlocks.fromBlock;
    const stepSize = blockRange / BigInt(config.maxDataPoints);

    // Generate quantized block numbers (every 300 blocks = ~1 hour)
    const blockNumbers: bigint[] = [];
    for (let i = 0; i < config.maxDataPoints; i++) {
      const targetBlock = targetBlocks.fromBlock + stepSize * BigInt(i);
      // Quantize to nearest 300-block boundary
      const quantizedBlock = this._quantizeToBlockBoundary(targetBlock, 300n);
      blockNumbers.push(quantizedBlock);
    }

    // Check cache for existing data points using quantized blocks
    const cachedPoints: PriceDataPoint[] = [];
    const missingBlocks: bigint[] = [];

    for (const blockNumber of blockNumbers) {
      const pointKey = `hour_${blockNumber}`; // Use "hour_" prefix for quantized blocks
      const cachedPoint = this._getPointFromCache(pointKey);

      if (cachedPoint) {
        cachedPoints.push(cachedPoint);
      } else {
        missingBlocks.push(blockNumber);
      }
    }

    // Only fetch missing data points
    let newPoints: PriceDataPoint[] = [];
    if (missingBlocks.length > 0) {
      try {
        const testAmount = parseEther("1"); // 1 LUSD
        const batchResult = await this._rpcBatchService.batchHistoryRequests(publicClient, missingBlocks, this._curvePoolAddress, testAmount);

        if (batchResult.errors.length > 0) {
          console.warn("⚠️ Some batched requests had errors:", batchResult.errors);
        }

        // Process new data points and cache them
        for (let i = 0; i < missingBlocks.length; i++) {
          const block = batchResult.blocks[i];
          const price = batchResult.prices[i];

          if (block && price > 0n) {
            const point: PriceDataPoint = {
              timestamp: Number(block.timestamp),
              price,
              blockNumber: missingBlocks[i],
            };

            // Cache the new point with quantized key
            const pointKey = `hour_${missingBlocks[i]}`;
            this._cachePoint(pointKey, point);

            newPoints.push(point);
          }
        }
      } catch (error) {
        console.error("❌ Batched RPC sampling failed:", error);
        return cachedPoints; // Return at least cached data
      }
    }

    // Combine cached and new points, sort by block number
    const allPoints = [...cachedPoints, ...newPoints].sort((a, b) => Number(a.blockNumber - b.blockNumber));

    return allPoints;
  }

  /**
   * Parse TokenExchange event from log data
   */
  private _parseTokenExchangeEvent(log: Log): TokenExchangeEvent | null {
    try {
      // Basic parsing - in a real implementation, you'd use proper ABI decoding
      const data = log.data;
      const topics = log.topics;

      if (!data || topics.length < 1) return null;

      // This is a simplified parsing - in production, use proper ABI decoding libraries
      return {
        buyer: `0x${topics[1]?.slice(26)}` as Address,
        soldId: BigInt(`0x${data.slice(2, 66)}`),
        tokensSold: BigInt(`0x${data.slice(66, 130)}`),
        boughtId: BigInt(`0x${data.slice(130, 194)}`),
        tokensBought: BigInt(`0x${data.slice(194, 258)}`),
      };
    } catch {
      return null;
    }
  }

  /**
   * Check if the swap is between LUSD and UUSD
   */
  private _isLUSDUUSDSwap(event: TokenExchangeEvent): boolean {
    return (event.soldId === this._lusdIndex && event.boughtId === this._uusdIndex) || (event.soldId === this._uusdIndex && event.boughtId === this._lusdIndex);
  }

  /**
   * Calculate UUSD price from a swap event
   */
  private _calculatePriceFromSwap(event: TokenExchangeEvent): bigint {
    const lusdPriceUsd = 1000000n; // Assume $1.00 in 6 decimal precision

    if (event.soldId === this._lusdIndex && event.boughtId === this._uusdIndex) {
      // LUSD -> UUSD swap: price = (LUSD_amount / UUSD_amount) * LUSD_price
      return (event.tokensSold * lusdPriceUsd) / event.tokensBought;
    } else if (event.soldId === this._uusdIndex && event.boughtId === this._lusdIndex) {
      // UUSD -> LUSD swap: price = (LUSD_amount / UUSD_amount) * LUSD_price
      return (event.tokensBought * lusdPriceUsd) / event.tokensSold;
    }

    return 0n;
  }

  /**
   * Calculate block range for a given time period
   */
  private _calculateBlockRange(currentBlock: bigint, hours: number): { fromBlock: bigint; toBlock: bigint } {
    // Ethereum averages ~12 seconds per block
    const avgBlockTime = 12;
    const blocksPerHour = 3600 / avgBlockTime; // ~300 blocks per hour
    const targetBlocks = BigInt(Math.floor(hours * blocksPerHour));

    const fromBlock = currentBlock - targetBlocks;

    return {
      fromBlock: fromBlock > 0n ? fromBlock : 1n,
      toBlock: currentBlock,
    };
  }

  /**
   * Quantize block number to nearest boundary (e.g., every 300 blocks)
   * This creates consistent cache keys across page refreshes
   */
  private _quantizeToBlockBoundary(blockNumber: bigint, boundary: bigint): bigint {
    return (blockNumber / boundary) * boundary;
  }

  /**
   * Check if cache is valid
   */
  private _isCacheValid(cacheKey: string): boolean {
    return this._cache.has(cacheKey) && Date.now() - this._cacheTimestamp < this._cacheTtlMs;
  }

  /**
   * Get a price point from cache if valid (checks both memory and localStorage)
   */
  private _getPointFromCache(pointKey: string): PriceDataPoint | null {
    // First check memory cache
    let cached = this._pointCache.get(pointKey);

    // If not in memory, try localStorage with current key format
    if (!cached) {
      try {
        const stored = localStorage.getItem(`price_${pointKey}`);
        if (stored) {
          cached = JSON.parse(stored);
          // Restore to memory cache
          if (cached) {
            this._pointCache.set(pointKey, cached);
          }
        }
      } catch {
        // Ignore localStorage errors
      }
    }

    if (!cached) return null;

    // Check if cache entry is still valid (30 minutes)
    const cacheAge = Date.now() - cached.timestamp;
    if (cacheAge > this._pointCacheTtlMs) {
      this._pointCache.delete(pointKey);
      try {
        localStorage.removeItem(`price_${pointKey}`);
      } catch {
        // Ignore localStorage errors
      }
      return null;
    }

    // Convert BigInt strings back to BigInt
    if (typeof cached.point.price === "string") {
      cached.point.price = BigInt(cached.point.price);
    }
    if (typeof cached.point.blockNumber === "string") {
      cached.point.blockNumber = BigInt(cached.point.blockNumber);
    }

    return cached.point;
  }

  /**
   * Cache a price point (stores in both memory and localStorage)
   */
  private _cachePoint(pointKey: string, point: PriceDataPoint): void {
    const cacheData = {
      point: {
        ...point,
        price: point.price.toString(), // Convert BigInt to string for JSON
        blockNumber: point.blockNumber.toString(),
      },
      timestamp: Date.now(),
    };

    // Store in memory
    this._pointCache.set(pointKey, {
      point,
      timestamp: Date.now(),
    });

    // Store in localStorage
    try {
      localStorage.setItem(`price_${pointKey}`, JSON.stringify(cacheData));
    } catch {
      // Ignore localStorage errors (quota exceeded, etc.)
    }
  }

  /**
   * Clear the price history cache
   */
  clearCache(): void {
    this._cache.clear();
    this._pointCache.clear();
    this._cacheTimestamp = 0;
  }

  /**
   * Clean up cache entries older than one week
   */
  private _cleanupOldCache(): void {
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000; // 1 week in milliseconds
    const cutoffTime = Date.now() - oneWeekMs;
    let cleanedCount = 0;

    try {
      // Clean up localStorage
      const keysToRemove: string[] = [];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith("price_block_") || key.startsWith("price_hour_"))) {
          try {
            const stored = localStorage.getItem(key);
            if (stored) {
              const cached = JSON.parse(stored);
              if (cached.timestamp && cached.timestamp < cutoffTime) {
                keysToRemove.push(key);
              }
            }
          } catch {
            // If we can't parse it, it's probably corrupted - remove it
            keysToRemove.push(key);
          }
        }
      }

      // Remove old entries
      keysToRemove.forEach((key) => {
        localStorage.removeItem(key);
        cleanedCount++;
      });

      if (cleanedCount > 0) {
        // Cache cleanup completed
      }
    } catch (error) {
      // Ignore localStorage errors
      console.warn("⚠️ Could not clean up old cache entries:", error);
    }
  }
}
