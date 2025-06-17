/**
 * Permanent caching system for Diamond CLI
 * Caches function discovery and results permanently until manually cleared
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import type { DiscoveredFunction } from './function-discovery.ts';
import type { FunctionCallResult } from './function-caller.ts';
import type { Address } from 'viem';

/**
 * Cache file paths
 */
const CACHE_DIR = join(process.cwd(), 'tools', '.cache');
const FUNCTIONS_CACHE = join(CACHE_DIR, 'functions.json');
const RESULTS_CACHE = join(CACHE_DIR, 'function-results.json');
const METADATA_CACHE = join(CACHE_DIR, 'metadata.json');

/**
 * Cache metadata structure
 */
export interface CacheMetadata {
    contractAddress: Address;
    lastDiscovery: string;
    lastFunctionCall: string;
    blockNumber: bigint;
    chainId: number;
    totalFunctions: number;
    successfulCalls: number;
}

/**
 * Initialize cache directory
 */
export function initializeCacheDir(): void {
    if (!existsSync(CACHE_DIR)) {
        mkdirSync(CACHE_DIR, { recursive: true });
    }
}

/**
 * Check if functions cache exists and is valid
 */
export function hasFunctionsCache(): boolean {
    return existsSync(FUNCTIONS_CACHE);
}

/**
 * Check if results cache exists and is valid
 */
export function hasResultsCache(): boolean {
    return existsSync(RESULTS_CACHE);
}

/**
 * Load cached functions
 */
export function loadCachedFunctions(): DiscoveredFunction[] | null {
    try {
        if (!hasFunctionsCache()) return null;

        const data = readFileSync(FUNCTIONS_CACHE, 'utf-8');
        if (!data.trim()) return null; // Empty file

        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to load cached functions:', error);
        // Clear corrupted cache
        try {
            unlinkSync(FUNCTIONS_CACHE);
        } catch {}
        return null;
    }
}

/**
 * Save functions to cache
 */
export function saveFunctionsCache(functions: DiscoveredFunction[]): void {
    try {
        initializeCacheDir();
        writeFileSync(FUNCTIONS_CACHE, JSON.stringify(functions, null, 2));
    } catch (error) {
        console.error('Failed to save functions cache:', error);
    }
}

/**
 * Load cached function results
 */
export function loadCachedResults(): FunctionCallResult[] | null {
    try {
        if (!hasResultsCache()) return null;

        const data = readFileSync(RESULTS_CACHE, 'utf-8');
        // Parse with BigInt support
        return JSON.parse(data, (key, value) => {
            if (typeof value === 'string' && /^\d+n$/.test(value)) {
                return BigInt(value.slice(0, -1));
            }
            return value;
        });
    } catch (error) {
        console.error('Failed to load cached results:', error);
        return null;
    }
}

/**
 * Save function results to cache
 */
export function saveResultsCache(results: FunctionCallResult[]): void {
    try {
        initializeCacheDir();
        // Stringify with BigInt support
        const json = JSON.stringify(results, (key, value) => {
            if (typeof value === 'bigint') {
                return value.toString() + 'n';
            }
            return value;
        }, 2);
        writeFileSync(RESULTS_CACHE, json);
    } catch (error) {
        console.error('Failed to save results cache:', error);
    }
}

/**
 * Load cache metadata
 */
export function loadCacheMetadata(): CacheMetadata | null {
    try {
        if (!existsSync(METADATA_CACHE)) return null;

        const data = readFileSync(METADATA_CACHE, 'utf-8');
        const metadata = JSON.parse(data);

        // Parse BigInt fields
        if (metadata.blockNumber && typeof metadata.blockNumber === 'string') {
            metadata.blockNumber = BigInt(metadata.blockNumber);
        }

        return metadata;
    } catch (error) {
        console.error('Failed to load cache metadata:', error);
        return null;
    }
}

/**
 * Save cache metadata
 */
export function saveCacheMetadata(metadata: CacheMetadata): void {
    try {
        initializeCacheDir();
        // Stringify with BigInt support
        const json = JSON.stringify(metadata, (key, value) => {
            if (typeof value === 'bigint') {
                return value.toString();
            }
            return value;
        }, 2);
        writeFileSync(METADATA_CACHE, json);
    } catch (error) {
        console.error('Failed to save cache metadata:', error);
    }
}

/**
 * Clear all cache files
 */
export function clearCache(): void {
    try {
        if (existsSync(FUNCTIONS_CACHE)) {
            writeFileSync(FUNCTIONS_CACHE, '');
        }
        if (existsSync(RESULTS_CACHE)) {
            writeFileSync(RESULTS_CACHE, '');
        }
        if (existsSync(METADATA_CACHE)) {
            writeFileSync(METADATA_CACHE, '');
        }
        console.log('✅ Cache cleared successfully');
    } catch (error) {
        console.error('❌ Failed to clear cache:', error);
    }
}

/**
 * Get cache status information
 */
export function getCacheStatus(): {
    functionsExists: boolean;
    resultsExists: boolean;
    metadataExists: boolean;
    metadata: CacheMetadata | null;
} {
    return {
        functionsExists: hasFunctionsCache(),
        resultsExists: hasResultsCache(),
        metadataExists: existsSync(METADATA_CACHE),
        metadata: loadCacheMetadata()
    };
}

/**
 * Display cache status in human-readable format
 */
export function displayCacheStatus(): void {
    const status = getCacheStatus();

    console.log('📋 Cache Status');
    console.log(''.padEnd(13, '─'));
    console.log(`Functions cache: ${status.functionsExists ? '✅ Exists' : '❌ Missing'}`);
    console.log(`Results cache: ${status.resultsExists ? '✅ Exists' : '❌ Missing'}`);
    console.log(`Metadata cache: ${status.metadataExists ? '✅ Exists' : '❌ Missing'}`);

    if (status.metadata) {
        console.log('\n📊 Cache Information:');
        console.log(`   Contract: ${status.metadata.contractAddress}`);
        console.log(`   Last discovery: ${status.metadata.lastDiscovery}`);
        console.log(`   Last function calls: ${status.metadata.lastFunctionCall}`);
        console.log(`   Block number: ${status.metadata.blockNumber}`);
        console.log(`   Chain ID: ${status.metadata.chainId}`);
        console.log(`   Total functions: ${status.metadata.totalFunctions}`);
        console.log(`   Successful calls: ${status.metadata.successfulCalls}`);
    }
}

/**
 * Check if we need to refresh cache for a different contract
 */
export function shouldRefreshCache(contractAddress: Address): boolean {
    const metadata = loadCacheMetadata();
    if (!metadata) return true;

    return metadata.contractAddress.toLowerCase() !== contractAddress.toLowerCase();
}
