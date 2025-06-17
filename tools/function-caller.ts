import type { PublicClient, Address } from 'viem';
import { formatEther, isAddress } from 'viem';
import type { DiscoveredFunction } from './function-discovery.ts';
import { getParameterSpec, generateParameters, type ParameterContext } from './parameter-provider.ts';
import { executeFunctionsBatch } from './batch-caller.ts';
import { formatParameterForDisplay } from './cli-utils.ts';

/**
 * Result of a single function call
 */
export interface FunctionCallResult {
    functionName: string;
    success: boolean;
    result?: any;
    error?: string;
    parameters?: any[];
}

/**
 * Filter functions that are safe and feasible to call automatically
 */
export function filterCallableFunctions(functions: DiscoveredFunction[]): DiscoveredFunction[] {
    return functions.filter(func =>
        func.isCallable && !func.hasParameters
    );
}

/**
 * Enhanced filtering to categorize functions by parameter handling strategy
 */
export function filterEnhancedCallableFunctions(functions: DiscoveredFunction[]): {
    zeroParamFunctions: DiscoveredFunction[];
    smartParamFunctions: DiscoveredFunction[];
    basicParamFunctions: DiscoveredFunction[];
} {
    const zeroParamFunctions: DiscoveredFunction[] = [];
    const smartParamFunctions: DiscoveredFunction[] = [];
    const basicParamFunctions: DiscoveredFunction[] = [];

    for (const func of functions) {
        if (!func.isCallable) continue;

        if (!func.hasParameters) {
            zeroParamFunctions.push(func);
        } else {
            const spec = getParameterSpec(func);
            if (spec) {
                smartParamFunctions.push(func);
            } else if (func.inputs.length === 1 && func.inputs[0].type === 'bytes32') {
                // Basic parameter handling for simple cases like getRoleAdmin
                basicParamFunctions.push(func);
            }
        }
    }

    return { zeroParamFunctions, smartParamFunctions, basicParamFunctions };
}

/**
 * Call functions with generated parameters in batches
 */
export async function callParameterizedFunctionsBatch(
    client: PublicClient,
    contractAddress: Address,
    functions: DiscoveredFunction[],
    context: ParameterContext,
    batchSize: number
): Promise<FunctionCallResult[]> {
    const allResults: FunctionCallResult[] = [];

    for (const func of functions) {
        const parameters = await generateParameters(func, context);
        if (parameters.length === 0) continue;

        const batchCalls = parameters.map((params: any) => ({
            ...func,
            args: params
        }));

        const batchResult = await executeFunctionsBatch(
            contractAddress,
            batchCalls,
            batchSize
        );

        allResults.push(...batchResult.results);
    }

    return allResults;
}

/**
 * Format function call results for display, organized by facet
 */
export function formatResultsByFacet(
    results: FunctionCallResult[],
    functions: DiscoveredFunction[]
): string {
    const groupedByFacet = new Map<string, {
        facetAddress: Address;
        results: FunctionCallResult[];
    }>();

    const functionMap = new Map(functions.map(f => [f.name, f]));

    for (const result of results) {
        const func = functionMap.get(result.functionName);
        if (!func) continue;

        const key = `${func.facetName} (${func.facetAddress})`;
        if (!groupedByFacet.has(key)) {
            groupedByFacet.set(key, {
                facetAddress: func.facetAddress,
                results: []
            });
        }
        groupedByFacet.get(key)!.results.push(result);
    }

    let output = '';
    for (const [facetKey, { results }] of groupedByFacet.entries()) {
        const successfulCount = results.filter(r => r.success).length;
        output += `\n📋 ${facetKey}\n`;
        output += `──────────────────────────────────────────────────────────────────\n`;
        output += `   Functions called: ${successfulCount}/${results.length} successful\n\n`;

        for (const result of results) {
            const func = functionMap.get(result.functionName);
            if (!func) continue;

            if (result.success) {
                output += `   ✅ ${result.functionName} (${func.selector})\n`;
                output += `      Signature: ${func.signature}\n`;
                output += `      State Mutability: ${func.stateMutability}\n`;

                if (result.parameters && result.parameters.length > 0) {
                    const formattedParams = result.parameters.map(formatParameterForDisplay).join(', ');
                    output += `      Parameters Used: [${formattedParams}]\n`;
                }

                const formattedResult = formatResultForDisplay(result.result);
                output += `      Result: ${formattedResult}\n\n`;
            } else {
                output += `   ❌ ${result.functionName} (${func.selector}) - FAILED\n`;
                output += `      Signature: ${func.signature}\n`;
                output += `      Error: ${result.error}\n\n`;
            }
        }
    }

    return output;
}

/**
 * Format a single result value for display
 */
function formatResultForDisplay(result: any): string {
    if (result === null || result === undefined) return 'N/A';

    // Custom replacer for BigInt
    const replacer = (key: string, value: any) =>
        typeof value === 'bigint' ? value.toString() : value;

    if (Array.isArray(result)) {
        const formattedArray = result.map(item => {
            if (typeof item === 'bigint') {
                return formatBigInt(item);
            }
            if (isAddress(item)) {
                return item;
            }
            return JSON.stringify(item, replacer);
        });
        return `[\n     ${formattedArray.join(',\n     ')}\n   ]`;
    }

    if (typeof result === 'bigint') {
        return formatBigInt(result);
    }

    if (isAddress(result)) {
        return result;
    }

    if (typeof result === 'object') {
        return JSON.stringify(result, replacer, 2);
    }

    return String(result);
}

/**
 * Format a BigInt value with extra context
 */
function formatBigInt(value: bigint): string {
    try {
        // Attempt to format as Ether for readability
        const etherValue = formatEther(value);
        if (etherValue.includes('.') && etherValue.split('.')[1].length > 4) {
            // Likely a currency value
            return `$${parseFloat(etherValue).toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} (raw: ${value})`;
        }
        return `${etherValue} (raw: ${value})`;
    } catch {
        return value.toString();
    }
}
