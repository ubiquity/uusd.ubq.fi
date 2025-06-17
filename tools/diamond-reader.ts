#!/usr/bin/env bun

/**
 * Enhanced Dynamic Diamond Contract Reader CLI
 *
 * Auto-discovers and calls all available view/pure functions from the diamond contract.
 * Features permanent caching and efficient batch JSON-RPC calls for maximum speed.
 *
 * Much faster than manually checking each facet on Etherscan!
 */

import { CLI_COMMANDS } from './config.ts';
import {
    parseArgs,
    isValidCommand,
    showHelp,
    showConnectionInfo,
    showLoading,
    showSectionHeader,
    showSuccess,
    showError
} from './cli-utils.ts';
import {
    createContractReader,
    testConnection,
    handleContractError
} from './contract-reader.ts';
import {
    discoverAllFunctions,
    groupFunctionsByFacet,
    type DiscoveredFunction
} from './function-discovery.ts';
import {
    filterCallableFunctions,
    filterEnhancedCallableFunctions,
    callParameterizedFunctionsBatch,
    formatResultsByFacet,
    type FunctionCallResult
} from './function-caller.ts';
import {
    buildParameterContext,
    displayParameterSpecsSummary,
    getParameterizedFunctions,
    hasParameterSpec
} from './parameter-provider.ts';
import {
    executeFunctionsBatch,
    testBatchExecution,
    type BatchExecutionResult
} from './batch-caller.ts';
import {
    loadCachedFunctions,
    saveFunctionsCache,
    loadCachedResults,
    saveResultsCache,
    loadCacheMetadata,
    saveCacheMetadata,
    shouldRefreshCache,
    clearCache,
    displayCacheStatus,
    type CacheMetadata
} from './cache-manager.ts';
import { CONTRACT_ADDRESSES } from './config.ts';
import { join } from 'node:path';

// Path to facet source files for function signature discovery
const FACET_SOURCES_PATH = join(process.cwd(), 'contracts/packages/contracts/src/dollar/facets');

/**
 * Execute the specified command
 */
async function executeCommand(command: string, client: any, verbose: boolean): Promise<void> {
    switch (command) {
        case CLI_COMMANDS.DEFAULT:
            await executeDefaultBehavior(client, verbose);
            break;
        case CLI_COMMANDS.DISCOVER_ONLY:
            await displayDiscoveredFunctions(client, verbose);
            break;
        case CLI_COMMANDS.CLEAR_CACHE:
            clearCache();
            break;
        case CLI_COMMANDS.CACHE_INFO:
            displayCacheStatus();
            break;
        case CLI_COMMANDS.HELP:
            showHelp();
            break;
        default:
            showError(`Unknown command: ${command}`);
            showHelp();
    }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
    try {
        const args = parseArgs();

        // Handle non-network commands first
        if (args.command === CLI_COMMANDS.HELP) {
            showHelp();
            return;
        }

        if (args.command === CLI_COMMANDS.CLEAR_CACHE) {
            clearCache();
            return;
        }

        if (args.command === CLI_COMMANDS.CACHE_INFO) {
            displayCacheStatus();
            return;
        }

        // Network-dependent commands require connection
        showLoading('Connecting to RPC...');
        const client = createContractReader();

        // Test connection and get proper network info
        const connectionInfo = await testConnection(client);
        showConnectionInfo(Number(connectionInfo.blockNumber), connectionInfo.chainId);

        await executeCommand(args.command, client, args.verbose);
    } catch (err) {
        handleContractError(err, 'executing CLI command');
    }
}

/**
 * Default behavior: Discover functions and call them (with caching)
 */
async function executeDefaultBehavior(client: any, verbose: boolean): Promise<void> {
    try {
        // Check if we need to refresh cache for different contract
        if (shouldRefreshCache(CONTRACT_ADDRESSES.DIAMOND)) {
            showLoading('Cache is for different contract, refreshing...');
        }

        // Try to load cached functions first
        let functions = loadCachedFunctions();
        let fromCache = true;

        if (!functions) {
            showLoading('Discovering diamond functions...');
            functions = await discoverAllFunctions(
                client,
                CONTRACT_ADDRESSES.DIAMOND,
                FACET_SOURCES_PATH
            );

            // Cache the discovered functions
            saveFunctionsCache(functions);
            fromCache = false;

            showSuccess(`Discovered ${functions.length} functions from diamond contract`);
        } else {
            showSuccess(`Loaded ${functions.length} functions from cache`);
        }

        // Enhanced filtering to categorize functions by parameter handling
        const { zeroParamFunctions, smartParamFunctions, basicParamFunctions } =
            filterEnhancedCallableFunctions(functions);

        // Debug: Check which functions have parameter specs
        if (verbose) {
            console.log('\n🔍 Debug: Parameter matching results:');
            for (const func of functions.filter(f => f.name.startsWith('unknown_0x'))) {
                const hasSpec = hasParameterSpec(func);
                console.log(`   ${func.name} (${func.selector}) - Has spec: ${hasSpec}, Has params: ${func.hasParameters}, Is callable: ${func.isCallable}, State: ${func.stateMutability}`);
            }
        }

        const totalCallableFunctions = zeroParamFunctions.length + smartParamFunctions.length + basicParamFunctions.length;

        if (totalCallableFunctions === 0) {
            showError('No safe functions found to call automatically');
            return;
        }

        // Show parameter specs summary if there are smart parameter functions and verbose mode
        if (smartParamFunctions.length > 0 && verbose) {
            displayParameterSpecsSummary();
        }

        // Try to load cached results
        let results = loadCachedResults();
        let resultsFromCache = true;

        if (!results || !fromCache) {
            console.log(`\n🎯 Function Execution Plan:`);
            console.log(`   📋 Zero-parameter functions: ${zeroParamFunctions.length}`);
            console.log(`   🧠 Smart-parameter functions: ${smartParamFunctions.length}`);
            console.log(`   ⚙️  Basic-parameter functions: ${basicParamFunctions.length}`);
            console.log(`   📊 Total executable functions: ${totalCallableFunctions}`);

            // Start with zero-parameter functions using batch RPC
            showLoading(`Executing ${zeroParamFunctions.length} zero-parameter functions...`);

            const batchResult = await executeFunctionsBatch(
                CONTRACT_ADDRESSES.DIAMOND,
                zeroParamFunctions,
                50 // Optimal batch size for efficiency
            );

            results = [...batchResult.results];

            // Build parameter context for smart parameter functions
            if (smartParamFunctions.length > 0) {
                showLoading('Building parameter context...');
                const parameterContext = await buildParameterContext(
                    client,
                    CONTRACT_ADDRESSES.DIAMOND,
                    functions
                );

                showLoading(`Executing ${smartParamFunctions.length} smart-parameter functions...`);
                const smartResults = await callParameterizedFunctionsBatch(
                    client,
                    CONTRACT_ADDRESSES.DIAMOND,
                    smartParamFunctions,
                    parameterContext,
                    5 // Smaller batch size for parameterized functions
                );

                results.push(...smartResults);
            }

            // Handle basic parameter functions if any
            if (basicParamFunctions.length > 0) {
                showLoading(`Executing ${basicParamFunctions.length} basic-parameter functions...`);
                const basicResult = await executeFunctionsBatch(
                    CONTRACT_ADDRESSES.DIAMOND,
                    basicParamFunctions,
                    20 // Medium batch size for basic parameter functions
                );

                results.push(...basicResult.results);
            }

            resultsFromCache = false;

            // Cache the results
            saveResultsCache(results);

            const totalExecutionTime = batchResult.executionTimeMs; // Could aggregate if we track all times
            showSuccess(`Completed ${results.length} function calls in ${totalExecutionTime}ms`);

            const successfulCalls = results.filter(r => r.success).length;
            console.log(`📊 Success rate: ${successfulCalls}/${results.length} (${((successfulCalls / results.length) * 100).toFixed(1)}%)`);
        } else {
            showSuccess(`Loaded ${results.length} function call results from cache`);
        }

        // Update cache metadata
        const connectionInfo = await testConnection(client);
        const metadata: CacheMetadata = {
            contractAddress: CONTRACT_ADDRESSES.DIAMOND,
            lastDiscovery: fromCache ? (loadCacheMetadata()?.lastDiscovery || new Date().toISOString()) : new Date().toISOString(),
            lastFunctionCall: resultsFromCache ? (loadCacheMetadata()?.lastFunctionCall || new Date().toISOString()) : new Date().toISOString(),
            blockNumber: connectionInfo.blockNumber,
            chainId: connectionInfo.chainId,
            totalFunctions: functions.length,
            successfulCalls: results.filter(r => r.success).length
        };
        saveCacheMetadata(metadata);

        console.log();

        // Display results organized by facet
        const formattedResults = formatResultsByFacet(results, functions);
        console.log(formattedResults);

        // Summary statistics
        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        showSectionHeader('Execution Summary');
        console.log(`✅ Successful calls: ${successCount}`);
        console.log(`❌ Failed calls: ${failureCount}`);
        console.log(`📊 Success rate: ${((successCount / results.length) * 100).toFixed(1)}%`);
        console.log(`💾 Results cached for instant future access`);

        if (failureCount > 0 && verbose) {
            console.log('\n🔍 Failed Function Details:');
            for (const result of results.filter(r => !r.success)) {
                console.log(`   ${result.functionName}: ${result.error}`);
            }
        }

    } catch (error) {
        showError(`Failed to execute default behavior: ${error}`);
    }
}

/**
 * Display discovered functions without calling them
 */
async function displayDiscoveredFunctions(client: any, verbose: boolean): Promise<void> {
    try {
        // Try to load from cache first
        let functions = loadCachedFunctions();

        if (!functions) {
            showLoading('Discovering diamond functions...');
            functions = await discoverAllFunctions(
                client,
                CONTRACT_ADDRESSES.DIAMOND,
                FACET_SOURCES_PATH
            );

            // Cache the discovered functions
            saveFunctionsCache(functions);
            showSuccess(`Discovered ${functions.length} functions from diamond contract`);
        } else {
            showSuccess(`Loaded ${functions.length} functions from cache`);
        }

        console.log();

        // Group functions by facet for organized display
        const groupedFunctions = groupFunctionsByFacet(functions);

        for (const [facetName, facetFunctions] of groupedFunctions) {
            showSectionHeader(`${facetName}`);

            const viewFunctions = facetFunctions.filter(f => f.isCallable);
            const otherFunctions = facetFunctions.filter(f => !f.isCallable);

            if (viewFunctions.length > 0) {
                console.log('📖 View/Pure Functions (callable):');
                for (const func of viewFunctions) {
                    const paramInfo = func.hasParameters ? ` (${func.inputs.length} params)` : ' (no params)';
                    console.log(`   ✅ ${func.signature}${paramInfo}`);
                }
                console.log();
            }

            if (otherFunctions.length > 0 && verbose) {
                console.log('🔒 Write Functions (not callable):');
                for (const func of otherFunctions) {
                    const paramInfo = func.hasParameters ? ` (${func.inputs.length} params)` : ' (no params)';
                    console.log(`   ⚠️  ${func.signature}${paramInfo}`);
                }
                console.log();
            }
        }

        // Summary
        const callableFunctions = functions.filter(f => f.isCallable);
        const safeToCall = filterCallableFunctions(functions);

        console.log('📊 Discovery Summary:');
        console.log(`   Total functions: ${functions.length}`);
        console.log(`   View/Pure functions: ${callableFunctions.length}`);
        console.log(`   Safe to auto-call: ${safeToCall.length}`);
        console.log();
        console.log('💡 Run without arguments to automatically call all safe functions');

    } catch (error) {
        showError(`Failed to discover functions: ${error}`);
    }
}

// Run the CLI
main();
