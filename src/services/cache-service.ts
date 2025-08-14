/**
 * Centralized caching service for blockchain data with smart TTL management
 * and graceful fallback for stale oracle data
 */

import type { ContractService } from "./contract-service.ts";

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
  isStale?: boolean;
}

interface CacheOptions {
  ttl: number; // Time to live in milliseconds
  fallbackToStale?: boolean; // Return stale data if fresh fetch fails
  maxAge?: number; // Maximum age before data is considered unusable
}

/**
 * Default cache configurations for different data types
 */
export const CACHE_CONFIGS = {
  // Oracle prices (frequently changing, but can use stale data)
  GOVERNANCE_PRICE: { ttl: 15000, fallbackToStale: true, maxAge: 300000 }, // 15s TTL, 5min max age
  LUSD_ORACLE_PRICE: { ttl: 15000, fallbackToStale: true, maxAge: 300000 },
  UUSD_MARKET_PRICE: { ttl: 10000, fallbackToStale: true, maxAge: 180000 },

  // Protocol settings (less frequent changes)
  COLLATERAL_RATIO: { ttl: 30000, fallbackToStale: true, maxAge: 600000 }, // 30s TTL, 10min max age
  PROTOCOL_SETTINGS: { ttl: 60000, fallbackToStale: true, maxAge: 600000 },

  // User-specific data (needs frequent updates)
  USER_BALANCES: { ttl: 10000, fallbackToStale: false, maxAge: 60000 }, // 10s TTL, 1min max age
  ALLOWANCES: { ttl: 15000, fallbackToStale: false, maxAge: 120000 },

  // Static/semi-static data
  COLLATERAL_OPTIONS: { ttl: 300000, fallbackToStale: true, maxAge: 3600000 }, // 5min TTL, 1hr max age
  PRICE_THRESHOLDS: { ttl: 120000, fallbackToStale: true, maxAge: 600000 }, // 2min TTL, 10min max age
} as const;

export class CacheService {
  private _cache = new Map<string, CacheEntry<unknown>>();
  private _pendingRequests = new Map<string, Promise<unknown>>();
  private _maxCacheSize = 1000; // Prevent memory bloat

  /**
   * Get data from cache or fetch fresh data
   */
  async getOrFetch<T>(key: string, fetchFn: () => Promise<T>, options: CacheOptions = CACHE_CONFIGS.GOVERNANCE_PRICE): Promise<T> {
    const now = Date.now();
    const cached = this._cache.get(key);

    // Return fresh cached data
    if (cached && now - cached.timestamp < cached.ttl) {
      return cached.data as T;
    }

    // Check if we have a pending request for this key
    if (this._pendingRequests.has(key)) {
      const pendingRequest = this._pendingRequests.get(key);
      if (pendingRequest) {
        return pendingRequest as Promise<T>;
      }
    }

    // Create new fetch request
    const fetchPromise = this._performFetch(key, fetchFn, options, cached);
    this._pendingRequests.set(key, fetchPromise);

    try {
      const result = await fetchPromise;
      return result as T;
    } finally {
      this._pendingRequests.delete(key);
    }
  }

  /**
   * Perform the actual fetch with error handling and stale fallback
   */
  private async _performFetch<T>(key: string, fetchFn: () => Promise<T>, options: CacheOptions, cached?: CacheEntry<T>): Promise<T> {
    const now = Date.now();

    try {
      const data = await fetchFn();

      // Store fresh data in cache
      this._setCache(key, data, options);

      return data;
    } catch (error) {
      console.warn(`❌ Fetch failed for ${key}:`, error);

      // Try to use stale data if allowed and available
      if (options.fallbackToStale && cached) {
        const age = now - cached.timestamp;
        const maxAge = options.maxAge || 600000; // Default 10 min max age

        if (age < maxAge) {
          // Mark as stale for UI indicators
          cached.isStale = true;
          return cached.data;
        }
      }

      // If oracle-specific error, provide better error message
      if (this._isOracleError(error)) {
        // For oracle errors, we might want to use alternative calculation methods
        if (key.includes("governance-price") && cached) {
          cached.isStale = true;
          return cached.data;
        }
      }

      // Re-throw error if no fallback available
      throw error;
    }
  }

  /**
   * Set data in cache with cleanup if needed
   */
  private _setCache<T>(key: string, data: T, options: CacheOptions): void {
    // Clean up old entries if cache is getting too large
    if (this._cache.size >= this._maxCacheSize) {
      this._cleanup();
    }

    this._cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: options.ttl,
      isStale: false,
    });
  }

  /**
   * Check if error is oracle-related
   */
  private _isOracleError(error: unknown): boolean {
    const errorMessage = (error as Error)?.message?.toLowerCase() || "";
    return errorMessage.includes("stale data") || errorMessage.includes("oracle") || errorMessage.includes("chainlink") || errorMessage.includes("price feed");
  }

  /**
   * Clean up old cache entries
   */
  private _cleanup(): void {
    const now = Date.now();
    const entriesToDelete: string[] = [];

    for (const [key, entry] of this._cache.entries()) {
      const maxAge = 3600000; // 1 hour absolute max
      if (now - entry.timestamp > maxAge) {
        entriesToDelete.push(key);
      }
    }

    entriesToDelete.forEach((key) => this._cache.delete(key));
  }

  /**
   * Invalidate specific cache key
   */
  invalidate(key: string): void {
    this._cache.delete(key);
  }

  /**
   * Invalidate cache keys matching pattern
   */
  invalidatePattern(pattern: string): void {
    const keysToDelete: string[] = [];
    for (const key of this._cache.keys()) {
      if (key.includes(pattern)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => this._cache.delete(key));
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; keys: string[]; hitRate?: number } {
    return {
      size: this._cache.size,
      keys: Array.from(this._cache.keys()),
    };
  }

  /**
   * Check if data is stale (for UI indicators)
   */
  isStale(key: string): boolean {
    const cached = this._cache.get(key);
    return cached?.isStale === true;
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this._cache.clear();
  }

  /**
   * Warm cache with commonly needed data
   */
  async warmCache(contractService: ContractService): Promise<void> {
    const warmupTasks: Array<{ key: string; fn: () => Promise<unknown>; config: CacheOptions }> = [
      { key: "collateral-ratio", fn: () => contractService.getCollateralRatio(), config: CACHE_CONFIGS.COLLATERAL_RATIO },
      { key: "lusd-oracle-price", fn: () => contractService.getLUSDOraclePrice(), config: CACHE_CONFIGS.LUSD_ORACLE_PRICE },
      { key: "protocol-settings", fn: () => contractService.getProtocolSettings(), config: CACHE_CONFIGS.PROTOCOL_SETTINGS },
    ];

    // Execute warmup tasks in parallel but don't throw if they fail
    await Promise.allSettled(
      warmupTasks.map((task) =>
        this.getOrFetch(task.key, task.fn, task.config).catch((err) => {
          console.warn(`Warmup failed for ${task.key}:`, err);
          return null;
        })
      )
    );
  }
}

// Export singleton instance
export const cacheService = new CacheService();
