#!/usr/bin/env bun

/**
 * Test script to manually check for mintPriceThreshold and redeemPriceThreshold functions
 */

import { createPublicClient, http, type Address } from 'viem';
import { mainnet } from 'viem/chains';

const DIAMOND_ADDRESS = '0xED3084c98148e2528DaDCB53C56352e549C488fA' as Address;

// Create client
const client = createPublicClient({
    chain: mainnet,
    transport: http('https://mainnet.gateway.tenderly.co')
});

// Potential function signatures to test
const potentialFunctions = [
    'mintPriceThreshold()',
    'redeemPriceThreshold()',
    'getMintPriceThreshold()',
    'getRedeemPriceThreshold()',
    'mintThreshold()',
    'redeemThreshold()',
];

async function testFunction(signature: string) {
    try {
        console.log(`Testing: ${signature}`);

        // Create simple ABI for the function
        const abi = [{
            name: signature.split('(')[0],
            type: 'function',
            stateMutability: 'view',
            inputs: [],
            outputs: [{ type: 'uint256' }]
        }];

        const result = await client.readContract({
            address: DIAMOND_ADDRESS,
            abi,
            functionName: signature.split('(')[0]
        });

        console.log(`✅ ${signature} returned:`, result);
        return result;
    } catch (error: any) {
        console.log(`❌ ${signature} failed:`, error.message);
        return null;
    }
}

async function main() {
    console.log('🔍 Testing potential threshold functions...\n');

    for (const func of potentialFunctions) {
        await testFunction(func);
        console.log(''); // Add spacing
    }

    console.log('✅ Test complete');
}

main().catch(console.error);
