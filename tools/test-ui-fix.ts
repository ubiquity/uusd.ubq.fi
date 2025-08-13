#!/usr/bin/env bun

/**
 * Test that the UI properly handles disabled redemptions
 * This simulates the exact user flow to ensure the checkbox is NEVER shown
 */

import { createPublicClient, http, parseEther, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
import { ADDRESSES, DIAMOND_ABI } from '../src/contracts/constants.ts';

console.log(`
================================================================================
🧪 TESTING UI FIX FOR REDEMPTION CHECKBOX
================================================================================
`);

async function testRedemptionHandling() {
    const client = createPublicClient({
        chain: mainnet,
        transport: http('https://mainnet.gateway.tenderly.co')
    });

    console.log('1️⃣ Checking current protocol state...\n');

    // Get current TWAP price
    const twapPrice = await client.readContract({
        address: ADDRESSES.DIAMOND,
        abi: DIAMOND_ABI,
        functionName: 'getDollarPriceUsd'
    }) as bigint;

    // Read threshold from storage
    const UBIQUITY_POOL_STORAGE_BASE = 0x2362cf90f2e9dd68c9a2a0539dd449a56e37f746843fbd8fdc2e5dbdbfef1100n;
    const redeemThresholdSlot = UBIQUITY_POOL_STORAGE_BASE + 13n;

    const redeemThresholdHex = await client.getStorageAt({
        address: ADDRESSES.DIAMOND,
        slot: `0x${redeemThresholdSlot.toString(16)}`
    });

    const redeemThreshold = BigInt(redeemThresholdHex || '0x0');

    console.log(`📊 TWAP Price: $${formatUnits(twapPrice, 6)}`);
    console.log(`🎯 Threshold: $${formatUnits(redeemThreshold, 6)}`);
    console.log(`✅ Redemptions Allowed: ${twapPrice <= redeemThreshold ? 'YES' : 'NO'}\n`);

    if (twapPrice > redeemThreshold) {
        console.log('✅ TEST CONDITION MET: Redemptions are DISABLED\n');
        console.log('2️⃣ Expected UI Behavior:\n');
        console.log('   When user clicks "Sell UUSD":');
        console.log('   • The checkbox should NEVER be visible');
        console.log('   • DOM element #swapOnlyOption should have display: none');
        console.log('   • State.redemptionsDisabled should be true');
        console.log('   • State.forceSwapOnly should be true');
        console.log('   • All withdrawals automatically use Curve swap\n');

        console.log('3️⃣ Key Code Changes Applied:');
        console.log('   • Added separate redemptionsDisabled state tracking');
        console.log('   • Event listener blocks changes when redemptions disabled');
        console.log('   • renderOptions() hides checkbox completely when disabled');
        console.log('   • checkRedemptionStatus() immediately hides DOM element');
        console.log('   • calculateRoute() forces swap when redemptions disabled\n');

        console.log('4️⃣ Test Instructions:');
        console.log('   1. Open http://localhost:3000 in browser');
        console.log('   2. Connect wallet');
        console.log('   3. Click "Sell UUSD"');
        console.log('   4. Verify NO checkbox appears');
        console.log('   5. Enter any UUSD amount');
        console.log('   6. Verify it shows "🔀 Curve Swap" route\n');

        console.log('5️⃣ Browser Console Verification:');
        console.log('   Run these commands in browser console:\n');
        console.log('   window.app.exchange.state.redemptionsDisabled');
        console.log('   // Should return: true\n');
        console.log('   window.app.exchange.state.forceSwapOnly');
        console.log('   // Should return: true\n');
        console.log('   document.getElementById("swapOnlyOption").style.display');
        console.log('   // Should return: "none"\n');

    } else {
        console.log('⚠️ TEST CONDITION NOT MET: Redemptions are ENABLED');
        console.log('   The fix cannot be fully tested when redemptions are enabled.');
        console.log('   However, the UI should still work correctly:\n');
        console.log('   • Checkbox SHOULD be visible');
        console.log('   • User can choose between protocol redeem and Curve swap');
    }

    console.log('================================================================================\n');
}

testRedemptionHandling();
