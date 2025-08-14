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
  
  // Curve pool exchange rates
  CURVE_EXCHANGE_RATE: { ttl: 15000, fallbackToStale: true, maxAge: 300000 }, // 15s TTL, 5min max age
  CURVE_DY_QUOTE: { ttl: 10000, fallbackToStale: true, maxAge: 180000 }, // 10s TTL, 3min max age
  
  // Contract reads
  DOLLAR_IN_COLLATERAL: { ttl: 30000, fallbackToStale: true, maxAge: 300000 }, // 30s TTL, 5min max age
  REDEEM_COLLATERAL_BALANCE: { ttl: 15000, fallbackToStale: false, maxAge: 120000 }, // 15s TTL, 2min max age
  
  // Price history (can be cached longer)
  PRICE_HISTORY: { ttl: 300000, fallbackToStale: true, maxAge: 1800000 }, // 5min TTL, 30min max age
} as const;

export class CacheService {
  private _cache = new Map<string, CacheEntry<unknown>>();
  private _pendingRequests = new Map<string, Promise<unknown>>();
  private _maxCacheSize = 1000; // Prevent memory bloat
  private _localStoragePrefix = "ubiquity_cache_";
  private _localStorageEnabled = true;

  constructor() {
    // Load cache from localStorage on startup
    this._loadFromLocalStorage();
  }

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

    const entry = {
      data,
      timestamp: Date.now(),
      ttl: options.ttl,
      isStale: false,
    };

    this._cache.set(key, entry);
    
    // Also save to localStorage if enabled
    if (this._localStorageEnabled) {
      this._saveToLocalStorage(key, entry);
    }
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
    
    // Also remove from localStorage
    if (this._localStorageEnabled) {
      try {
        localStorage.removeItem(this._localStoragePrefix + key);
      } catch {
        // Ignore localStorage errors
      }
    }
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
    keysToDelete.forEach((key) => {
      this._cache.delete(key);
      if (this._localStorageEnabled) {
        try {
          localStorage.removeItem(this._localStoragePrefix + key);
        } catch {
          // Ignore localStorage errors
        }
      }
    });
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
    
    // Clear all localStorage entries
    if (this._localStorageEnabled) {
      try {
        const keys = Object.keys(localStorage);
        keys.forEach(key => {
          if (key.startsWith(this._localStoragePrefix)) {
            localStorage.removeItem(key);
          }
        });
      } catch {
        // Ignore localStorage errors
      }
    }
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

  /**
   * Load cache from localStorage on startup
   */
  private _loadFromLocalStorage(): void {
    if (!this._localStorageEnabled) return;
    
    try {
      const keys = Object.keys(localStorage);
      const now = Date.now();
      
      keys.forEach(key => {
        if (key.startsWith(this._localStoragePrefix)) {
          const cacheKey = key.substring(this._localStoragePrefix.length);
          const stored = localStorage.getItem(key);
          
          if (stored) {
            try {
              const entry = this._deserializeFromStorage(stored);
              
              // Check if entry is still valid based on maxAge
              const age = now - entry.timestamp;
              const maxAge = 3600000; // 1 hour absolute max for localStorage
              
              if (age < maxAge) {
                this._cache.set(cacheKey, entry);
              } else {
                // Remove expired entry
                localStorage.removeItem(key);
              }
            } catch {
              // Remove corrupted entry
              localStorage.removeItem(key);
            }
          }
        }
      });
      
      console.log(`📦 Loaded ${this._cache.size} entries from localStorage cache`);
    } catch (error) {
      console.warn("Failed to load from localStorage cache:", error);
    }
  }

  /**
   * Save entry to localStorage
   */
  private _saveToLocalStorage(key: string, entry: CacheEntry<unknown>): void {
    try {
      const serialized = this._serializeForStorage(entry);
      localStorage.setItem(this._localStoragePrefix + key, serialized);
    } catch (error) {
      // Ignore quota errors or other localStorage issues
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        // Try to clean up old entries and retry once
        this._cleanupLocalStorage();
        try {
          const serialized = this._serializeForStorage(entry);
          localStorage.setItem(this._localStoragePrefix + key, serialized);
        } catch {
          // Give up if still failing
        }
      }
    }
  }

  /**
   * Serialize cache entry for localStorage (handles bigints)
   */
  private _serializeForStorage(entry: CacheEntry<unknown>): string {
    return JSON.stringify(entry, (key, value) => {
      // Convert bigints to strings
      if (typeof value === 'bigint') {
        return { __type: 'bigint', value: value.toString() };
      }
      // Handle Map objects
      if (value instanceof Map) {
        return { __type: 'Map', value: Array.from(value.entries()) };
      }
      return value;
    });
  }

  /**
   * Deserialize cache entry from localStorage (restores bigints)
   */
  private _deserializeFromStorage(stored: string): CacheEntry<unknown> {
    return JSON.parse(stored, (key, value) => {
      // Restore bigints
      if (value && typeof value === 'object' && value.__type === 'bigint') {
        return BigInt(value.value);
      }
      // Restore Map objects
      if (value && typeof value === 'object' && value.__type === 'Map') {
        return new Map(value.value);
      }
      return value;
    });
  }

  /**
   * Clean up old localStorage entries when quota is exceeded
   */
  private _cleanupLocalStorage(): void {
    try {
      const keys = Object.keys(localStorage);
      const cacheEntries: Array<{ key: string; timestamp: number }> = [];
      
      // Collect all cache entries with timestamps
      keys.forEach(key => {
        if (key.startsWith(this._localStoragePrefix)) {
          const stored = localStorage.getItem(key);
          if (stored) {
            try {
              const entry = this._deserializeFromStorage(stored);
              cacheEntries.push({ key, timestamp: entry.timestamp });
            } catch {
              // Remove corrupted entry
              localStorage.removeItem(key);
            }
          }
        }
      });
      
      // Sort by timestamp (oldest first) and remove oldest 25%
      cacheEntries.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = Math.ceil(cacheEntries.length * 0.25);
      
      for (let i = 0; i < toRemove; i++) {
        localStorage.removeItem(cacheEntries[i].key);
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Export singleton instance
export const cacheService = new CacheService();
