import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { DiscoveredFunction } from './function-discovery.ts';
import type { FunctionCallResult } from './function-caller.ts';

const CACHE_DIR = join(process.cwd(), '.cache');
const FUNCTIONS_CACHE = join(CACHE_DIR, 'functions.json');
const METADATA_CACHE = join(CACHE_DIR, 'metadata.json');

/**
 * Cache metadata structure
 */
export interface CacheMetadata {
    contractAddress: string;
    lastDiscovery: string;
    blockNumber: bigint;
    chainId: number;
    totalFunctions: number;
}

/**
 * Ensure cache directory exists
 */
function ensureCacheDir(): void {
    if (!existsSync(CACHE_DIR)) {
        require('node:fs').mkdirSync(CACHE_DIR, { recursive: true });
    }
}

/**
 * Save discovered functions to cache
 */
export function saveFunctionsCache(functions: DiscoveredFunction[]): void {
    ensureCacheDir();
    const data = JSON.stringify(functions, null, 2);
    writeFileSync(FUNCTIONS_CACHE, data, 'utf-8');
}

/**
 * Load discovered functions from cache
 */
export function loadCachedFunctions(): DiscoveredFunction[] | null {
    if (!existsSync(FUNCTIONS_CACHE)) return null;

    try {
        const data = readFileSync(FUNCTIONS_CACHE, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to load cached functions:', error);
        return null;
    }
}


/**
 * Save cache metadata
 */
export function saveCacheMetadata(metadata: CacheMetadata): void {
    ensureCacheDir();
    const data = JSON.stringify(metadata, (key, value) => {
        if (typeof value === 'bigint') {
            return value.toString();
        }
        return value;
    }, 2);
    writeFileSync(METADATA_CACHE, data, 'utf-8');
}

/**
 * Load cache metadata
 */
export function loadCacheMetadata(): CacheMetadata | null {
    try {
        if (!existsSync(METADATA_CACHE)) return null;

        const data = readFileSync(METADATA_CACHE, 'utf-8');
        const metadata = JSON.parse(data);

        // Convert blockNumber back to BigInt
        if (metadata.blockNumber) {
            metadata.blockNumber = BigInt(metadata.blockNumber);
        }

        return metadata;
    } catch (error) {
        console.error('Failed to load cache metadata:', error);
        return null;
    }
}

/**
 * Clear all cache files
 */
export function clearCache(): void {
    try {
        if (existsSync(FUNCTIONS_CACHE)) unlinkSync(FUNCTIONS_CACHE);
        if (existsSync(RESULTS_CACHE)) unlinkSync(RESULTS_CACHE);
        if (existsSync(METADATA_CACHE)) unlinkSync(METADATA_CACHE);
        console.log('✅ Cache cleared successfully');
    } catch (error) {
        console.error('Failed to clear cache:', error);
    }
}

/**
 * Display cache status
 */
export function displayCacheStatus(): void {
    const metadata = loadCacheMetadata();

    if (!metadata) {
        console.log('ℹ️ No cache found.');
        return;
    }

    console.log('📋 Cache Status:');
    console.log(`   Contract Address: ${metadata.contractAddress}`);
    console.log(`   Last Discovery: ${new Date(metadata.lastDiscovery).toLocaleString()}`);
    console.log(`   Last Function Call: ${new Date(metadata.lastFunctionCall).toLocaleString()}`);
    console.log(`   Block Number: ${metadata.blockNumber}`);
    console.log(`   Chain ID: ${metadata.chainId}`);
    console.log(`   Total Functions: ${metadata.totalFunctions}`);
    console.log(`   Successful Calls: ${metadata.successfulCalls}`);
}

/**
 * Decide if cache should be refreshed based on contract address
 */
export function shouldRefreshCache(currentAddress: string): boolean {
    const metadata = loadCacheMetadata();
    if (!metadata) return false; // No cache, so no need to refresh

    return metadata.contractAddress.toLowerCase() !== currentAddress.toLowerCase();
}
