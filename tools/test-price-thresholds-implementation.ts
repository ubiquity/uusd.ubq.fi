#!/usr/bin/env bun

/**
 * Test the new dynamic price threshold implementation
 */

import { PriceThresholdService } from '../src/services/price-threshold-service.ts';

async function testPriceThresholdService() {
    console.log('🧪 Testing PriceThresholdService...\n');

    const service = new PriceThresholdService();

    try {
        console.log('📊 Fetching price thresholds from contract storage...');
        const thresholds = await service.getPriceThresholds();

        console.log(`✅ Mint Threshold: ${thresholds.mintThreshold} ($${Number(thresholds.mintThreshold) / 1000000})`);
        console.log(`✅ Redeem Threshold: ${thresholds.redeemThreshold} ($${Number(thresholds.redeemThreshold) / 1000000})`);
        console.log(`📅 Last Updated: ${new Date(thresholds.lastUpdated).toISOString()}\n`);

        // Test caching
        console.log('🔄 Testing cache...');
        const startTime = Date.now();
        const cachedThresholds = await service.getPriceThresholds();
        const cacheTime = Date.now() - startTime;

        console.log(`⚡ Cache hit in ${cacheTime}ms`);
        console.log(`📊 Cached values match: ${thresholds.mintThreshold === cachedThresholds.mintThreshold && thresholds.redeemThreshold === cachedThresholds.redeemThreshold ? '✅' : '❌'}\n`);

        // Test synchronous cache access
        console.log('💾 Testing synchronous cache access...');
        const syncCache = service.getCachedThresholds();
        if (syncCache) {
            console.log(`✅ Sync cache available: Mint=${Number(syncCache.mintThreshold) / 1000000}, Redeem=${Number(syncCache.redeemThreshold) / 1000000}`);
        } else {
            console.log('❌ Sync cache not available');
        }

        console.log('\n🎉 PriceThresholdService tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);

        // Show what the fallback behavior looks like
        console.log('\n🔄 Testing fallback behavior...');
        try {
            const thresholds = await service.getPriceThresholds();
            console.log(`📊 Fallback - Mint: $${Number(thresholds.mintThreshold) / 1000000}, Redeem: $${Number(thresholds.redeemThreshold) / 1000000}`);
        } catch (fallbackError) {
            console.error('❌ Even fallback failed:', fallbackError);
        }
    }
}

async function main() {
    console.log('🚀 Testing Dynamic Price Threshold Implementation\n');
    await testPriceThresholdService();
}

main().catch(console.error);
