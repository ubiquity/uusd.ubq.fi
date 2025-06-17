/**
 * Dynamic function discovery for Diamond contracts
 * Uses DiamondLoupe to discover all available functions and their signatures
 */

import type { PublicClient, Address } from 'viem';
import { keccak256, toHex } from 'viem';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Interface for discovered function information
 */
export interface DiscoveredFunction {
    selector: string;
    signature: string;
    name: string;
    inputs: Array<{ name: string; type: string }>;
    outputs: Array<{ name: string; type: string }>;
    stateMutability: 'view' | 'pure' | 'nonpayable' | 'payable';
    facetAddress: Address;
    facetName: string;
    isCallable: boolean;
    hasParameters: boolean;
}

/**
 * Interface for facet information from DiamondLoupe
 */
export interface FacetInfo {
    facetAddress: Address;
    functionSelectors: string[];
}

/**
 * DiamondLoupe ABI for discovery
 */
export const DIAMOND_LOUPE_ABI = [
    {
        name: 'facets',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{
            type: 'tuple[]',
            components: [
                { name: 'facetAddress', type: 'address' },
                { name: 'functionSelectors', type: 'bytes4[]' }
            ]
        }]
    },
    {
        name: 'facetFunctionSelectors',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: '_facet', type: 'address' }],
        outputs: [{ type: 'bytes4[]' }]
    },
    {
        name: 'facetAddresses',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address[]' }]
    }
] as const;

/**
 * Get all facets and their function selectors from the diamond
 */
export async function discoverFacets(client: PublicClient, diamondAddress: Address): Promise<FacetInfo[]> {
    try {
        const facetsData = await client.readContract({
            address: diamondAddress,
            abi: DIAMOND_LOUPE_ABI,
            functionName: 'facets'
        }) as Array<{ facetAddress: Address; functionSelectors: string[] }>;

        return facetsData.map(facet => ({
            facetAddress: facet.facetAddress,
            functionSelectors: facet.functionSelectors
        }));
    } catch (error) {
        console.error('Failed to discover facets from diamond:', error);
        throw error;
    }
}

/**
 * Parse Solidity files to extract function signatures and metadata
 */
export function parseSolidityFunctions(facetSourcesPath: string): Map<string, DiscoveredFunction> {
    const functionMap = new Map<string, DiscoveredFunction>();
    const abiPath = join(process.cwd(), 'contracts/packages/contracts/out');

    try {
        const contractFiles = readdirSync(abiPath);

        for (const contractFile of contractFiles) {
            const contractPath = join(abiPath, contractFile);
            const files = readdirSync(contractPath);

            for (const file of files) {
                if (!file.endsWith('.json')) continue;

                const filePath = join(contractPath, file);
                const content = readFileSync(filePath, 'utf-8');
                const json = JSON.parse(content);
                const abi = json.abi;
                const facetName = file.replace('.json', '');

                if (!abi || !Array.isArray(abi)) continue;

                for (const item of abi) {
                    if (item.type !== 'function') continue;

                    const functionName = item.name;
                    const inputs = item.inputs || [];
                    const outputs = item.outputs || [];
                    const stateMutability = item.stateMutability || 'nonpayable';

                    // Generate function signature for selector calculation
                    const signature = `${functionName}(${inputs.map((i: any) => i.type).join(',')})`;

                    // Generate selector (first 4 bytes of keccak256 hash)
                    const selector = generateSelector(signature);

                    const discoveredFunction: DiscoveredFunction = {
                        selector,
                        signature,
                        name: functionName,
                        inputs,
                        outputs,
                        stateMutability,
                        facetAddress: '0x0000000000000000000000000000000000000000' as Address, // Will be set later
                        facetName,
                        isCallable: stateMutability === 'view' || stateMutability === 'pure',
                        hasParameters: inputs.length > 0
                    };

                    functionMap.set(selector, discoveredFunction);
                }
            }
        }
    } catch (error) {
        console.error('Failed to parse Solidity functions:', error);
    }

    return functionMap;
}

/**
 * Parse function parameters from string
 */
function parseParameters(paramsStr: string): Array<{ name: string; type: string }> {
    if (!paramsStr.trim()) return [];

    const params = paramsStr.split(',').map(p => p.trim()).filter(p => p);
    return params.map(param => {
        const parts = param.trim().split(/\s+/);
        if (parts.length >= 2) {
            const type = parts[0];
            const name = parts[1];
            return { name, type };
        } else {
            // Handle case where only type is provided
            return { name: '', type: parts[0] || param };
        }
    });
}

/**
 * Generate function selector from signature using proper keccak256
 */
function generateSelector(signature: string): string {
    const hash = keccak256(toHex(signature));
    return hash.slice(0, 10); // First 4 bytes (8 hex characters + 0x)
}

/**
 * Combine facet discovery with function metadata
 */
export async function discoverAllFunctions(
    client: PublicClient,
    diamondAddress: Address,
    facetSourcesPath: string
): Promise<DiscoveredFunction[]> {
    // Get facets from diamond
    const facets = await discoverFacets(client, diamondAddress);

    // Parse function signatures from source code
    const functionMap = parseSolidityFunctions(facetSourcesPath);

    // Combine the data
    const discoveredFunctions: DiscoveredFunction[] = [];

    for (const facet of facets) {
        for (const selector of facet.functionSelectors) {
            const functionInfo = functionMap.get(selector);
            if (functionInfo) {
                // Update with actual facet address
                const completeFunction = {
                    ...functionInfo,
                    facetAddress: facet.facetAddress
                };
                discoveredFunctions.push(completeFunction);
            } else {
                // Function selector found but no source code match
                // Create a minimal entry
                discoveredFunctions.push({
                    selector,
                    signature: `unknown_${selector}()`,
                    name: `unknown_${selector}`,
                    inputs: [],
                    outputs: [],
                    stateMutability: 'view',
                    facetAddress: facet.facetAddress,
                    facetName: 'Unknown',
                    isCallable: false,
                    hasParameters: false
                });
            }
        }
    }

    return discoveredFunctions;
}

/**
 * Group functions by facet for organized display
 */
export function groupFunctionsByFacet(functions: DiscoveredFunction[]): Map<string, DiscoveredFunction[]> {
    const grouped = new Map<string, DiscoveredFunction[]>();

    for (const func of functions) {
        const key = `${func.facetName} (${func.facetAddress})`;
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key)!.push(func);
    }

    return grouped;
}
