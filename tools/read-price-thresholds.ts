#!/usr/bin/env bun

/**
 * Tool to read mintPriceThreshold and redeemPriceThreshold directly from contract storage
 * Since the deployed contract doesn't have public getter functions for these values
 */

import { createPublicClient, http, type Address, keccak256, toHex, hexToBigInt } from 'viem';
import { mainnet } from 'viem/chains';

const DIAMOND_ADDRESS = '0xED3084c98148e2528DaDCB53C56352e549C488fA' as Address;

// Storage slot calculation for UbiquityPoolStorage
// bytes32 constant UBIQUITY_POOL_STORAGE_POSITION = bytes32(uint256(keccak256("ubiquity.contracts.ubiquity.pool.storage")) - 1) & ~bytes32(uint256(0xff));
const UBIQUITY_POOL_STORAGE_POSITION = BigInt(keccak256("0x756269717569747920636f6e7472616374732e7562697175697479706f6f6c2e73746f72616765")) - 1n;
const STORAGE_BASE = UBIQUITY_POOL_STORAGE_POSITION & ~BigInt(0xff);

// Create client
const client = createPublicClient({
    chain: mainnet,
    transport: http('https://mainnet.gateway.tenderly.co')
});

/**
 * Read storage slot at given position
 */
async function readStorageSlot(slot: bigint): Promise<bigint> {
    const storageValue = await client.getStorageAt({
        address: DIAMOND_ADDRESS,
        slot: toHex(slot)
    });

    if (!storageValue) {
        return 0n;
    }

    return hexToBigInt(storageValue);
}

/**
 * Calculate the storage slots for price thresholds
 * This is an approximation based on the struct layout - may need adjustment
 */
async function findPriceThresholds(): Promise<{ mintThreshold: bigint; redeemThreshold: bigint }> {
    console.log('🔍 Searching for price thresholds in contract storage...');
    console.log(`📍 Base storage position: ${toHex(STORAGE_BASE)}`);

    // Try to scan multiple slots to find the thresholds
    // mintPriceThreshold and redeemPriceThreshold should be consecutive uint256 values
    // Expected values: ~1010000 for mint, ~990000 for redeem

    const MIN_THRESHOLD = 900000n;  // $0.90
    const MAX_THRESHOLD = 1100000n; // $1.10

    let mintThreshold = 0n;
    let redeemThreshold = 0n;

    // Scan storage slots around the base position
    for (let offset = 0n; offset < 100n; offset++) {
        try {
            const slot = STORAGE_BASE + offset;
            const value = await readStorageSlot(slot);

            // Check if this looks like a price threshold
            if (value >= MIN_THRESHOLD && value <= MAX_THRESHOLD) {
                console.log(`📊 Found potential threshold at slot ${offset}: ${value} (${Number(value) / 1000000})`);

                // Check if the next slot has the other threshold
                const nextValue = await readStorageSlot(slot + 1n);
                if (nextValue >= MIN_THRESHOLD && nextValue <= MAX_THRESHOLD) {
                    console.log(`📊 Found consecutive threshold at slot ${offset + 1n}: ${nextValue} (${Number(nextValue) / 1000000})`);

                    // Determine which is mint vs redeem based on typical values
                    // Mint threshold is usually higher than redeem threshold
                    if (value > nextValue) {
                        mintThreshold = value;
                        redeemThreshold = nextValue;
                        console.log(`✅ Identified: Mint=${Number(value) / 1000000}, Redeem=${Number(nextValue) / 1000000}`);
                        break;
                    } else {
                        mintThreshold = nextValue;
                        redeemThreshold = value;
                        console.log(`✅ Identified: Mint=${Number(nextValue) / 1000000}, Redeem=${Number(value) / 1000000}`);
                        break;
                    }
                }
            }
        } catch (error) {
            // Skip slots that can't be read
            continue;
        }
    }

    return { mintThreshold, redeemThreshold };
}

async function main() {
    try {
        console.log('🔗 Connecting to Ethereum mainnet...');

        const result = await findPriceThresholds();

        if (result.mintThreshold === 0n || result.redeemThreshold === 0n) {
            console.log('❌ Could not find price thresholds in storage');
            console.log('💡 This might require manual inspection of the contract storage layout');
            return;
        }

        console.log('\n📈 Price Thresholds Found:');
        console.log(`   Mint Price Threshold:   ${result.mintThreshold} ($${Number(result.mintThreshold) / 1000000})`);
        console.log(`   Redeem Price Threshold: ${result.redeemThreshold} ($${Number(result.redeemThreshold) / 1000000})`);

        // Export for use in TypeScript
        console.log('\n🔧 For TypeScript usage:');
        console.log(`export const MINT_PRICE_THRESHOLD = ${result.mintThreshold}n;`);
        console.log(`export const REDEEM_PRICE_THRESHOLD = ${result.redeemThreshold}n;`);

    } catch (error) {
        console.error('❌ Failed to read price thresholds:', error);
    }
}

main();
