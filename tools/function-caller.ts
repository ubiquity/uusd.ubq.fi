/**
 * Dynamic function caller for Diamond contracts
 * Executes discovered view/pure functions and handles parameter patterns
 */

import type { PublicClient, Address } from 'viem';
import type { DiscoveredFunction } from './function-discovery.ts';

/**
 * Result of a function call
 */
export interface FunctionCallResult {
    functionName: string;
    signature: string;
    success: boolean;
    result?: any;
    error?: string;
    gasUsed?: bigint;
    parameters?: any[];
}

/**
 * Common parameter patterns for functions that require parameters
 */
export const PARAMETER_PATTERNS = {
    address: '0x0000000000000000000000000000000000000000' as Address,
    uint256: 0n,
    uint32: 0,
    uint8: 0,
    bool: false,
    bytes: '0x',
    bytes4: '0x00000000',
    bytes32: '0x0000000000000000000000000000000000000000000000000000000000000000',
    string: '',
    // Array types
    'address[]': [],
    'uint256[]': [],
    'bytes[]': [],
    'string[]': []
} as const;

/**
 * Generate parameters for a function based on its input types
 */
export function generateParameters(func: DiscoveredFunction): any[] {
    return func.inputs.map(input => {
        const baseType = input.type.replace(/\[\d*\]$/, ''); // Remove array notation
        const isArray = input.type.includes('[]');

        if (isArray) {
            return PARAMETER_PATTERNS[`${baseType}[]` as keyof typeof PARAMETER_PATTERNS] || [];
        }

        return PARAMETER_PATTERNS[baseType as keyof typeof PARAMETER_PATTERNS] || null;
    });
}

/**
 * Check if a function can be called with default parameters
 */
export function canCallWithDefaults(func: DiscoveredFunction): boolean {
    if (!func.hasParameters) return true;

    // Check if all parameter types have default patterns
    return func.inputs.every(input => {
        const baseType = input.type.replace(/\[\d*\]$/, '');
        const isArray = input.type.includes('[]');

        if (isArray) {
            return Object.hasOwnProperty.call(PARAMETER_PATTERNS, `${baseType}[]`);
        }

        return Object.hasOwnProperty.call(PARAMETER_PATTERNS, baseType);
    });
}

/**
 * Execute a single function call
 */
export async function callFunction(
    client: PublicClient,
    diamondAddress: Address,
    func: DiscoveredFunction,
    customParameters?: any[]
): Promise<FunctionCallResult> {
    try {
        const parameters = customParameters || (func.hasParameters ? generateParameters(func) : []);

        // Create minimal ABI for this function
        const functionAbi = {
            name: func.name,
            type: 'function',
            stateMutability: func.stateMutability,
            inputs: func.inputs.map(input => ({
                name: input.name,
                type: input.type
            })),
            outputs: func.outputs.map(output => ({
                name: output.name,
                type: output.type
            }))
        };

        const result = await client.readContract({
            address: diamondAddress,
            abi: [functionAbi],
            functionName: func.name,
            args: parameters
        });

        return {
            functionName: func.name,
            signature: func.signature,
            success: true,
            result,
            parameters: parameters.length > 0 ? parameters : undefined
        };
    } catch (error) {
        return {
            functionName: func.name,
            signature: func.signature,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            parameters: func.hasParameters ? (customParameters || generateParameters(func)) : undefined
        };
    }
}

/**
 * Execute multiple functions in parallel with rate limiting
 */
export async function callFunctionsBatch(
    client: PublicClient,
    diamondAddress: Address,
    functions: DiscoveredFunction[],
    batchSize: number = 5
): Promise<FunctionCallResult[]> {
    const results: FunctionCallResult[] = [];

    // Process functions in batches to avoid overwhelming the RPC
    for (let i = 0; i < functions.length; i += batchSize) {
        const batch = functions.slice(i, i + batchSize);

        const batchPromises = batch.map(func =>
            callFunction(client, diamondAddress, func)
        );

        const batchResults = await Promise.allSettled(batchPromises);

        // Convert settled promises to results
        for (const [index, settled] of batchResults.entries()) {
            if (settled.status === 'fulfilled') {
                results.push(settled.value);
            } else {
                // Handle promise rejection
                const func = batch[index];
                results.push({
                    functionName: func.name,
                    signature: func.signature,
                    success: false,
                    error: `Promise rejected: ${settled.reason}`,
                    parameters: func.hasParameters ? generateParameters(func) : undefined
                });
            }
        }

        // Add small delay between batches to be respectful to RPC
        if (i + batchSize < functions.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    return results;
}

/**
 * Filter functions that are safe to call automatically
 */
export function filterCallableFunctions(functions: DiscoveredFunction[]): DiscoveredFunction[] {
    return functions.filter(func => {
        // Must be view or pure
        if (!func.isCallable) return false;

        // Skip functions that are obviously dangerous or require specific setup
        const dangerousFunctions = [
            'supportsInterface', // ERC165, might return false for random inputs
            'facetAddress', // DiamondLoupe, requires specific selector
        ];

        if (dangerousFunctions.includes(func.name)) return false;

        // If function has parameters, check if we can provide defaults
        if (func.hasParameters) {
            return canCallWithDefaults(func);
        }

        return true;
    });
}

/**
 * Format function call result for display
 */
export function formatFunctionResult(result: FunctionCallResult): string {
    const lines: string[] = [];

    if (result.success) {
        lines.push(`✅ ${result.functionName}()`);
        if (result.parameters && result.parameters.length > 0) {
            lines.push(`   Parameters: ${JSON.stringify(result.parameters)}`);
        }

        if (result.result !== undefined) {
            // Format result based on type
            let formattedResult: string;

            if (typeof result.result === 'bigint') {
                formattedResult = result.result.toString();
            } else if (Array.isArray(result.result)) {
                formattedResult = `[${result.result.length} items]`;
            } else if (typeof result.result === 'object' && result.result !== null) {
                formattedResult = JSON.stringify(result.result, (key, value) =>
                    typeof value === 'bigint' ? value.toString() : value
                );
            } else {
                formattedResult = String(result.result);
            }

            lines.push(`   Result: ${formattedResult}`);
        }
    } else {
        lines.push(`❌ ${result.functionName}() - FAILED`);
        if (result.parameters && result.parameters.length > 0) {
            lines.push(`   Parameters: ${JSON.stringify(result.parameters)}`);
        }
        lines.push(`   Error: ${result.error}`);
    }

    return lines.join('\n');
}

/**
 * Group and format results by facet
 */
export function formatResultsByFacet(
    results: FunctionCallResult[],
    functions: DiscoveredFunction[]
): string {
    const lines: string[] = [];

    // Create a map of function name to facet info
    const functionToFacet = new Map<string, { facetName: string; facetAddress: Address }>();
    for (const func of functions) {
        functionToFacet.set(func.name, {
            facetName: func.facetName,
            facetAddress: func.facetAddress
        });
    }

    // Group results by facet
    const facetGroups = new Map<string, FunctionCallResult[]>();
    for (const result of results) {
        const facetInfo = functionToFacet.get(result.functionName);
        const facetKey = facetInfo
            ? `${facetInfo.facetName} (${facetInfo.facetAddress})`
            : 'Unknown Facet';

        if (!facetGroups.has(facetKey)) {
            facetGroups.set(facetKey, []);
        }
        facetGroups.get(facetKey)!.push(result);
    }

    // Format each facet group
    for (const [facetName, facetResults] of facetGroups) {
        lines.push(`\n📋 ${facetName}`);
        lines.push(''.padEnd(facetName.length + 3, '─'));

        const successCount = facetResults.filter(r => r.success).length;
        const totalCount = facetResults.length;
        lines.push(`   Functions called: ${successCount}/${totalCount} successful\n`);

        for (const result of facetResults) {
            const formatted = formatFunctionResult(result);
            lines.push('   ' + formatted.replace(/\n/g, '\n   '));
            lines.push('');
        }
    }

    return lines.join('\n');
}