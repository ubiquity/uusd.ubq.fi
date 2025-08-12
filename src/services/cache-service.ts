/**
 * Centralized caching service for blockchain data with smart TTL management
 * and graceful fallback for stale oracle data
 */

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
    private cache = new Map<string, CacheEntry<any>>();
    private pendingRequests = new Map<string, Promise<any>>();
    private maxCacheSize = 1000; // Prevent memory bloat

    /**
     * Get data from cache or fetch fresh data
     */
    async getOrFetch<T>(
        key: string,
        fetchFn: () => Promise<T>,
        options: CacheOptions = CACHE_CONFIGS.GOVERNANCE_PRICE
    ): Promise<T> {
        const now = Date.now();
        const cached = this.cache.get(key);

        // Return fresh cached data
        if (cached && now - cached.timestamp < cached.ttl) {
            console.log(`📦 Cache hit (fresh): ${key}`);
            return cached.data;
        }

        // Check if we have a pending request for this key
        if (this.pendingRequests.has(key)) {
            console.log(`⏳ Waiting for pending request: ${key}`);
            return this.pendingRequests.get(key)!;
        }

        // Create new fetch request
        const fetchPromise = this.performFetch(key, fetchFn, options, cached);
        this.pendingRequests.set(key, fetchPromise);

        try {
            const result = await fetchPromise;
            return result;
        } finally {
            this.pendingRequests.delete(key);
        }
    }

    /**
     * Perform the actual fetch with error handling and stale fallback
     */
    private async performFetch<T>(
        key: string,
        fetchFn: () => Promise<T>,
        options: CacheOptions,
        cached?: CacheEntry<T>
    ): Promise<T> {
        const now = Date.now();

        try {
            console.log(`🔄 Fetching fresh data: ${key}`);
            const data = await fetchFn();

            // Store fresh data in cache
            this.setCache(key, data, options);
            console.log(`✅ Fresh data cached: ${key}`);
            return data;

        } catch (error) {
            console.warn(`❌ Fetch failed for ${key}:`, error);

            // Try to use stale data if allowed and available
            if (options.fallbackToStale && cached) {
                const age = now - cached.timestamp;
                const maxAge = options.maxAge || 600000; // Default 10 min max age

                if (age < maxAge) {
                    console.log(`📦 Using stale data (${Math.round(age/1000)}s old): ${key}`);
                    // Mark as stale for UI indicators
                    cached.isStale = true;
                    return cached.data;
                }
            }

            // If oracle-specific error, provide better error message
            if (this.isOracleError(error)) {
                console.log(`🔮 Oracle error detected for ${key}, checking for alternatives`);

                // For oracle errors, we might want to use alternative calculation methods
                if (key.includes('governance-price') && cached) {
                    console.log(`📦 Using cached governance price due to oracle staleness`);
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
    private setCache<T>(key: string, data: T, options: CacheOptions): void {
        // Clean up old entries if cache is getting too large
        if (this.cache.size >= this.maxCacheSize) {
            this.cleanup();
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl: options.ttl,
            isStale: false
        });
    }

    /**
     * Check if error is oracle-related
     */
    private isOracleError(error: any): boolean {
        const errorMessage = error?.message?.toLowerCase() || '';
        return errorMessage.includes('stale data') ||
               errorMessage.includes('oracle') ||
               errorMessage.includes('chainlink') ||
               errorMessage.includes('price feed');
    }

    /**
     * Clean up old cache entries
     */
    private cleanup(): void {
        const now = Date.now();
        const entriesToDelete: string[] = [];

        for (const [key, entry] of this.cache.entries()) {
            const maxAge = 3600000; // 1 hour absolute max
            if (now - entry.timestamp > maxAge) {
                entriesToDelete.push(key);
            }
        }

        entriesToDelete.forEach(key => this.cache.delete(key));
        console.log(`🧹 Cleaned up ${entriesToDelete.length} stale cache entries`);
    }

    /**
     * Invalidate specific cache key
     */
    invalidate(key: string): void {
        this.cache.delete(key);
        console.log(`🗑️ Invalidated cache: ${key}`);
    }

    /**
     * Invalidate cache keys matching pattern
     */
    invalidatePattern(pattern: string): void {
        const keysToDelete: string[] = [];
        for (const key of this.cache.keys()) {
            if (key.includes(pattern)) {
                keysToDelete.push(key);
            }
        }
        keysToDelete.forEach(key => this.cache.delete(key));
        console.log(`🗑️ Invalidated ${keysToDelete.length} keys matching: ${pattern}`);
    }

    /**
     * Get cache statistics
     */
    getStats(): { size: number; keys: string[]; hitRate?: number } {
        return {
            size: this.cache.size,
            keys: Array.from(this.cache.keys())
        };
    }

    /**
     * Check if data is stale (for UI indicators)
     */
    isStale(key: string): boolean {
        const cached = this.cache.get(key);
        return cached?.isStale === true;
    }

    /**
     * Clear all cache
     */
    clear(): void {
        this.cache.clear();
        console.log('��️ Cache cleared');
    }

    /**
     * Warm cache with commonly needed data
     */
    async warmCache(contractService: any): Promise<void> {
        console.log('🔥 Warming cache with essential data...');

        const warmupTasks = [
            { key: 'collateral-ratio', fn: () => contractService.getCollateralRatio(), config: CACHE_CONFIGS.COLLATERAL_RATIO },
            { key: 'lusd-oracle-price', fn: () => contractService.getLUSDOraclePrice(), config: CACHE_CONFIGS.LUSD_ORACLE_PRICE },
            { key: 'protocol-settings', fn: () => contractService.getProtocolSettings(), config: CACHE_CONFIGS.PROTOCOL_SETTINGS },
        ];

        // Execute warmup tasks in parallel but don't throw if they fail
        const results = await Promise.allSettled(
            warmupTasks.map(task =>
                this.getOrFetch(task.key, task.fn, task.config).catch(err => {
                    console.warn(`Warmup failed for ${task.key}:`, err);
                    return null;
                })
            )
        );

        const successful = results.filter(r => r.status === 'fulfilled').length;
        console.log(`🔥 Cache warmed: ${successful}/${warmupTasks.length} tasks successful`);
    }
}

// Export singleton instance
export const cacheService = new CacheService();
