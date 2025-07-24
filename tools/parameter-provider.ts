#!/usr/bin/env bun

/**
 * Parameter Provider for Diamond Contract Functions
 *
 * Handles intelligent parameter generation for functions that require inputs.
 * Matches function selectors/names and provides contextually appropriate parameters.
 */

import type { Address, PublicClient } from 'viem';
import { parseEther, formatEther, isAddress } from 'viem';
import type { DiscoveredFunction } from './function-discovery.ts';
import { formatParameterForDisplay } from './cli-utils.ts';

// Zero address constant for safe queries
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as Address;

/**
 * Context passed to parameter generators
 */
export interface ParameterContext {
    contractClient: PublicClient;
    contractAddress: Address;
    allCollaterals?: Address[];
    collateralCount?: number;
    [key: string]: any;
}

/**
 * Parameter generator function type
 */
export interface ParameterGenerator {
    generate(context: ParameterContext): Promise<any[][]>;
    description: string;
    maxCalls?: number; // Limit number of calls to prevent spam
}

/**
 * Parameter specification for a function
 */
export interface ParameterSpec {
    selector: string;
    name: string;
    generator: ParameterGenerator;
    description: string;
    priority: number; // Higher priority = more important to call
}

/**
 * Standard sample amounts for testing calculations
 */
const SAMPLE_AMOUNTS = [
    parseEther('1'),     // 1 token
    parseEther('100'),   // 100 tokens
    parseEther('1000'),  // 1000 tokens
];

/**
 * Standard sample user addresses for testing user-specific functions
 */
const SAMPLE_ADDRESSES = [
    ZERO_ADDRESS, // Safe fallback
    // Could add known addresses from deployment or treasury
];

/**
 * Parameter specifications for UUSD Diamond contract functions
 */
const PARAMETER_SPECS: ParameterSpec[] = [
    // getRoleAdmin - Add support for bytes32 role hash
    {
        selector: '0x248a9ca3',
        name: 'getRoleAdmin',
        generator: {
            generate: async (context) => [
                ['0x0000000000000000000000000000000000000000000000000000000000000000']
            ],
            description: 'Admin role query for zero hash',
            maxCalls: 1
        },
        description: 'Get admin role for a given role hash',
        priority: 3
    },
    // Collateral Information - High Priority
    {
        selector: '0x82ae27cd',
        name: 'collateralInformation',
        generator: {
            generate: async (context) => {
                if (!context.allCollaterals?.length) return [];
                return context.allCollaterals.map(addr => [addr]);
            },
            description: 'Query information for each discovered collateral',
            maxCalls: 10
        },
        description: 'Detailed collateral configuration and status',
        priority: 10
    },

    // Free Collateral Balance - High Priority
    {
        selector: '0x17b2bffa',
        name: 'freeCollateralBalance',
        generator: {
            generate: async (context) => {
                const count = context.collateralCount || context.allCollaterals?.length || 1;
                return Array.from({ length: count }, (_, i) => [i]);
            },
            description: 'Free collateral balance for each collateral index',
            maxCalls: 10
        },
        description: 'Available collateral for AMO operations',
        priority: 9
    },

    // Dollar to Collateral Conversion - Medium Priority
    {
        selector: '0x87dcd5fb',
        name: 'getDollarInCollateral',
        generator: {
            generate: async (context) => {
                const count = context.collateralCount || context.allCollaterals?.length || 1;
                const results: any[][] = [];

                // Generate samples for each collateral index
                for (let i = 0; i < count && i < 3; i++) {
                    for (const amount of SAMPLE_AMOUNTS.slice(0, 2)) { // Limit to 2 amounts per collateral
                        results.push([i, amount]);
                    }
                }

                return results;
            },
            description: 'Dollar-to-collateral conversion for sample amounts',
            maxCalls: 6
        },
        description: 'Calculate collateral needed for dollar amounts',
        priority: 7
    },

    // User Redemption Balances - Lower Priority (requires real user addresses)
    {
        selector: '0x245cd973',
        name: 'getRedeemCollateralBalance',
        generator: {
            generate: async (context) => {
                const count = context.collateralCount || context.allCollaterals?.length || 1;
                const results: any[][] = [];

                // Only query with zero address for safety
                for (let i = 0; i < count && i < 3; i++) {
                    results.push([ZERO_ADDRESS, i]);
                }

                return results;
            },
            description: 'Redemption balances for zero address (safe query)',
            maxCalls: 3
        },
        description: 'User collateral available for redemption',
        priority: 5
    },

    // Governance Redemption Balance - Lower Priority
    {
        selector: '0x2287fe40',
        name: 'getRedeemGovernanceBalance',
        generator: {
            generate: async (context) => {
                return [
                    [ZERO_ADDRESS], // Safe query with zero address
                ];
            },
            description: 'Governance redemption balance for zero address',
            maxCalls: 1
        },
        description: 'User governance tokens available for redemption',
        priority: 4
    }
];

/**
 * Build parameter context by gathering prerequisite information
 */
export async function buildParameterContext(
    contractClient: PublicClient,
    contractAddress: Address,
    functions: DiscoveredFunction[]
): Promise<ParameterContext> {
    const context: ParameterContext = {
        contractClient,
        contractAddress
    };

    try {
        // Try to get all collaterals if the function exists
        const allCollateralsFunc = functions.find(f => f.name === 'allCollaterals');
        if (allCollateralsFunc) {
            try {
                const collaterals = await contractClient.readContract({
                    address: contractAddress,
                    abi: [{
                        name: 'allCollaterals',
                        type: 'function',
                        stateMutability: 'view',
                        inputs: [],
                        outputs: [{ type: 'address[]' }]
                    }],
                    functionName: 'allCollaterals'
                }) as Address[];

                context.allCollaterals = collaterals;
                context.collateralCount = collaterals.length;

                console.log(`📊 Built context: ${collaterals.length} collaterals discovered`);
            } catch (error) {
                console.log(`⚠️  Could not fetch collaterals for context: ${error}`);
            }
        }
    } catch (error) {
        console.log(`⚠️  Error building parameter context: ${error}`);
    }

    return context;
}

/**
 * Get parameter specification for a function
 */
export function getParameterSpec(func: DiscoveredFunction): ParameterSpec | null {
    return PARAMETER_SPECS.find(spec => {
        // Direct selector match
        if (spec.selector === func.selector) {
            return true;
        }

        // Direct name match
        if (spec.name === func.name) {
            return true;
        }

        // Handle "unknown_" functions - match by extracting selector from name
        if (func.name.startsWith('unknown_0x')) {
            const extractedSelector = func.name.replace('unknown_', '');
            if (spec.selector === extractedSelector) {
                return true;
            }
        }

        return false;
    }) || null;
}

/**
 * Generate parameters for a specific function
 */
export async function generateParameters(
    func: DiscoveredFunction,
    context: ParameterContext
): Promise<any[][]> {
    const spec = getParameterSpec(func);
    if (!spec) return [];

    try {
        const parameters = await spec.generator.generate(context);
        const maxCalls = spec.generator.maxCalls || 10;

        // Limit the number of calls to prevent spam
        const limitedParameters = parameters.slice(0, maxCalls);

        if (limitedParameters.length > 0) {
            console.log(`📝 Generated ${limitedParameters.length} parameter sets for ${func.name}`);
        }

        return limitedParameters;
    } catch (error) {
        console.log(`❌ Error generating parameters for ${func.name}: ${error}`);
        return [];
    }
}

/**
 * Check if a function has available parameters
 */
export function hasParameterSpec(func: DiscoveredFunction): boolean {
    return PARAMETER_SPECS.some(spec => {
        // Direct selector match
        if (spec.selector === func.selector) {
            return true;
        }

        // Direct name match
        if (spec.name === func.name) {
            return true;
        }

        // Handle "unknown_" functions - match by extracting selector from name
        if (func.name.startsWith('unknown_0x')) {
            const extractedSelector = func.name.replace('unknown_', '');
            if (spec.selector === extractedSelector) {
                return true;
            }
        }

        return false;
    });
}

/**
 * Get all functions that have parameter specifications
 */
export function getParameterizedFunctions(functions: DiscoveredFunction[]): DiscoveredFunction[] {
    return functions.filter(func => hasParameterSpec(func));
}

/**
 * Get parameter specs sorted by priority
 */
export function getParameterSpecsByPriority(): ParameterSpec[] {
    return [...PARAMETER_SPECS].sort((a, b) => b.priority - a.priority);
}

/**
 * Display summary of available parameter specs
 */
export function displayParameterSpecsSummary(): void {
    console.log('\n📋 Available Parameter Specifications:');

    for (const spec of getParameterSpecsByPriority()) {
        console.log(`   ✅ ${spec.name} (${spec.selector})`);
        console.log(`      Priority: ${spec.priority}, Max calls: ${spec.generator.maxCalls || 'unlimited'}`);
        console.log(`      ${spec.description}`);
    }

    console.log(`\n💡 Total parameterized functions supported: ${PARAMETER_SPECS.length}`);
}
