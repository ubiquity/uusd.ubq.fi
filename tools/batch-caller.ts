/**
 * Efficient batch JSON-RPC caller
 * Uses single HTTP request with multiple eth_call operations for maximum efficiency
 */

import type { Address } from 'viem';
import { encodeFunctionData, decodeFunctionResult } from 'viem';
import type { DiscoveredFunction } from './function-discovery.ts';
import type { FunctionCallResult } from './function-caller.ts';
import { RPC_CONFIG } from './config.ts';

/**
 * JSON-RPC request structure
 */
interface JsonRpcRequest {
    jsonrpc: string;
    id: number;
    method: string;
    params: any[];
}

/**
 * JSON-RPC response structure
 */
interface JsonRpcResponse {
    id: number;
    result?: string;
    error?: {
        code: number;
        message: string;
    };
}

/**
 * Batch execution result
 */
export interface BatchExecutionResult {
    results: FunctionCallResult[];
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    executionTimeMs: number;
}

/**
 * Execute multiple function calls in a single batch JSON-RPC request
 */
export async function executeFunctionsBatch(
    diamondAddress: Address,
    functions: DiscoveredFunction[],
    maxBatchSize: number = 50
): Promise<BatchExecutionResult> {
    const startTime = Date.now();
    const allResults: FunctionCallResult[] = [];

    // Process functions in batches to avoid overwhelming the RPC
    for (let i = 0; i < functions.length; i += maxBatchSize) {
        const batch = functions.slice(i, i + maxBatchSize);
        const batchResults = await executeSingleBatch(diamondAddress, batch);
        allResults.push(...batchResults);

        // Small delay between batches to be respectful to RPC
        if (i + maxBatchSize < functions.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }

    const executionTimeMs = Date.now() - startTime;
    const successfulRequests = allResults.filter(r => r.success).length;

    return {
        results: allResults,
        totalRequests: allResults.length,
        successfulRequests,
        failedRequests: allResults.length - successfulRequests,
        executionTimeMs
    };
}

/**
 * Recursively map ABI parameters to preserve components for complex types
 */
function mapAbiParameter(param: any): any {
    const result: any = {
        name: param.name,
        type: param.type
    };

    // Preserve internalType if present
    if (param.internalType) {
        result.internalType = param.internalType;
    }

    // Recursively preserve components for tuple types
    if (param.components && Array.isArray(param.components)) {
        result.components = param.components.map(mapAbiParameter);
    }

    return result;
}

/**
 * Execute a single batch of function calls
 */
async function executeSingleBatch(
    diamondAddress: Address,
    functions: DiscoveredFunction[]
): Promise<FunctionCallResult[]> {
    try {
        // Prepare batch requests
        const batchRequests: JsonRpcRequest[] = [];
        const functionDetails: Array<{
            func: DiscoveredFunction;
            abi: any;
        }> = [];

        for (const [index, func] of functions.entries()) {
            try {
                // Create complete ABI for this function, preserving components for complex types
                const functionAbi = {
                    name: func.name,
                    type: 'function',
                    stateMutability: func.stateMutability,
                    inputs: func.inputs.map(mapAbiParameter),
                    outputs: func.outputs.map(mapAbiParameter)
                };

                // Use args from the function if they exist (for parameterized calls)
                const args = (func as any).args || [];

                // Encode function call data
                const callData = encodeFunctionData({
                    abi: [functionAbi],
                    functionName: func.name,
                    args
                });

                // Add to batch request
                batchRequests.push({
                    jsonrpc: '2.0',
                    id: index,
                    method: 'eth_call',
                    params: [
                        {
                            to: diamondAddress,
                            data: callData
                        },
                        'latest'
                    ]
                });

                functionDetails.push({
                    func,
                    abi: functionAbi
                });
            } catch (error) {
                // If we can't prepare the call, add a failed result
                functionDetails.push({
                    func,
                    abi: null
                });
            }
        }

        // Execute batch request
        const response = await fetch(RPC_CONFIG.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(batchRequests)
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const rawResponse = await response.json();

        // Handle different response formats
        let batchResponses: JsonRpcResponse[];
        if (Array.isArray(rawResponse)) {
            batchResponses = rawResponse;
        } else if (rawResponse && typeof rawResponse === 'object') {
            // Some RPC endpoints return single response even for batch
            batchResponses = [rawResponse];
        } else {
            throw new Error(`Unexpected response format: ${typeof rawResponse}`);
        }

        // Process responses
        const results: FunctionCallResult[] = [];

        for (const [index, detail] of functionDetails.entries()) {
            const { func, abi } = detail;
            const rpcResponse = batchResponses.find(r => r.id === index);
            const args = (func as any).args || [];

            if (!abi) {
                // Function preparation failed
                results.push({
                    functionName: func.name,
                    success: false,
                    error: 'Failed to prepare function call',
                    parameters: args.length > 0 ? args : undefined
                });
                continue;
            }

            if (!rpcResponse) {
                // No response for this request
                results.push({
                    functionName: func.name,
                    success: false,
                    error: 'No response received',
                    parameters: args.length > 0 ? args : undefined
                });
                continue;
            }

            if (rpcResponse.error) {
                // RPC error
                results.push({
                    functionName: func.name,
                    success: false,
                    error: rpcResponse.error.message,
                    parameters: args.length > 0 ? args : undefined
                });
                continue;
            }

            if (!rpcResponse.result) {
                // No result data
                results.push({
                    functionName: func.name,
                    success: false,
                    error: 'Empty result',
                    parameters: args.length > 0 ? args : undefined
                });
                continue;
            }

            try {
                // Decode successful result
                const decodedResult = decodeFunctionResult({
                    abi: [abi],
                    functionName: func.name,
                    data: rpcResponse.result as `0x${string}`
                });

                results.push({
                    functionName: func.name,
                    success: true,
                    result: decodedResult,
                    parameters: args.length > 0 ? args : undefined
                });
            } catch (decodeError) {
                // Decoding failed
                results.push({
                    functionName: func.name,
                    success: false,
                    error: `Decode error: ${decodeError instanceof Error ? decodeError.message : String(decodeError)}`,
                    parameters: args.length > 0 ? args : undefined
                });
            }
        }

        return results;
    } catch (error) {
        // Batch execution failed completely
        return functions.map(func => {
            const args = (func as any).args || [];
            return {
                functionName: func.name,
                success: false,
                error: `Batch execution failed: ${error instanceof Error ? error.message : String(error)}`,
                parameters: args.length > 0 ? args : undefined
            };
        });
    }
}

/**
 * Test batch functionality with a small subset of functions
 */
export async function testBatchExecution(
    diamondAddress: Address,
    functions: DiscoveredFunction[],
    maxFunctions: number = 3
): Promise<BatchExecutionResult> {
    const testFunctions = functions.slice(0, maxFunctions);
    console.log(`🧪 Testing batch execution with ${testFunctions.length} functions...`);

    const result = await executeFunctionsBatch(diamondAddress, testFunctions, 10);

    console.log(`✅ Test completed: ${result.successfulRequests}/${result.totalRequests} successful`);
    console.log(`⏱️  Execution time: ${result.executionTimeMs}ms`);

    return result;
}
