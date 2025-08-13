import { createPublicClient, http, parseEther, formatUnits } from 'viem';
import { mainnet } from 'viem/chains';
import { ADDRESSES, DIAMOND_ABI } from '../src/contracts/constants.ts';

async function checkRedemptionStatus() {
    console.log('🔍 Checking protocol redemption status...\n');

    const client = createPublicClient({
        chain: mainnet,
        transport: http('https://mainnet.gateway.tenderly.co')
    });

    try {
        // Get current TWAP price
        const twapPrice = await client.readContract({
            address: ADDRESSES.DIAMOND,
            abi: DIAMOND_ABI,
            functionName: 'getDollarPriceUsd'
        }) as bigint;

        console.log(`📊 Current TWAP Price: $${formatUnits(twapPrice, 6)}`);

        // Read thresholds from storage (correct storage base)
        const UBIQUITY_POOL_STORAGE_BASE = 0x2a1c4d9e43cc908458204ba8dd637dd73ede6adc739c3209ac617ae953246c00n;
        const redeemThresholdSlot = UBIQUITY_POOL_STORAGE_BASE + 13n;

        const redeemThresholdHex = await client.getStorageAt({
            address: ADDRESSES.DIAMOND,
            slot: `0x${redeemThresholdSlot.toString(16)}`
        });

        const redeemThreshold = BigInt(redeemThresholdHex || '0x0');
        console.log(`🎯 Redeem Threshold: $${formatUnits(redeemThreshold, 6)}`);

        // Check if redemptions are allowed
        // Redemptions are allowed when TWAP is ABOVE threshold (e.g. TWAP > $1.00)
        const isRedeemingAllowed = twapPrice >= redeemThreshold;
        console.log(`\n✅ Redemptions Allowed: ${isRedeemingAllowed ? 'YES' : 'NO'}`);

        if (!isRedeemingAllowed) {
            console.log('⚠️  Protocol redemptions are currently DISABLED');
            console.log('📝 UI should force "Use Curve swap only" checkbox to be checked and disabled');
        } else {
            console.log('✅ Protocol redemptions are currently ENABLED');
            console.log('📝 UI should allow users to choose between protocol redeem and Curve swap');
        }

        // Try to simulate a redeem to double-check
        console.log('\n🧪 Testing actual redeem simulation...');
        try {
            const testAmount = parseEther('1'); // 1 UUSD
            await client.simulateContract({
                address: ADDRESSES.DIAMOND,
                abi: DIAMOND_ABI,
                functionName: 'redeemDollar',
                args: [0n, testAmount, 0n, 0n],
                account: '0x0000000000000000000000000000000000000001'
            });
            console.log('✅ Redeem simulation succeeded - redemptions are working');
        } catch (error: any) {
            const errorMsg = error.message || error.toString();
            if (errorMsg.includes('Dollar price too high')) {
                console.log('❌ Redeem simulation failed: Dollar price too high');
                console.log('📝 This confirms redemptions are blocked by protocol');
            } else {
                console.log('❌ Redeem simulation failed:', errorMsg.slice(0, 100));
            }
        }

    } catch (error) {
        console.error('Error checking redemption status:', error);
    }
}

checkRedemptionStatus();
