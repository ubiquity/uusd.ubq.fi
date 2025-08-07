/// <reference lib="deno.ns" />
import { createPublicClient, http, formatUnits, type Address } from 'viem';
import { mainnet } from 'viem/chains';

// Contract addresses
const DIAMOND_ADDRESS = '0xED3084c98148e2528DaDCB53C56352e549C488fA' as Address;
const UUSD_ADDRESS = '0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103' as Address;
const LUSD_ADDRESS = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0' as Address;
const RPC_URL = 'https://rpc.ubq.fi/1';

// Create viem client
const client = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL)
});

const ERC20_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

async function verifyBackingFix() {
  console.log('🔍 VERIFYING UUSD BACKING FIX\n');
  console.log(`📍 Diamond Contract: ${DIAMOND_ADDRESS}`);
  console.log(`📍 UUSD Address: ${UUSD_ADDRESS}`);
  console.log(`📍 LUSD Address: ${LUSD_ADDRESS}\n`);

  try {
    // Get current balances
    const [uusdSupply, lusdBalance] = await Promise.all([
      client.readContract({
        address: UUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'totalSupply'
      }) as Promise<bigint>,
      client.readContract({
        address: LUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [DIAMOND_ADDRESS]
      }) as Promise<bigint>
    ]);

    // Format values
    const uusdSupplyFormatted = formatUnits(uusdSupply, 18);
    const lusdBalanceFormatted = formatUnits(lusdBalance, 18);

    console.log('💰 CURRENT BALANCES:');
    console.log(`   UUSD Total Supply: ${uusdSupplyFormatted} UUSD`);
    console.log(`   LUSD in Diamond: ${lusdBalanceFormatted} LUSD`);

    // Calculate backing ratio
    const backingRatio = uusdSupply > 0n ? (lusdBalance * 10000n) / uusdSupply : 0n;
    const backingPercentage = Number(backingRatio) / 100;

    console.log('\n📊 BACKING ANALYSIS:');
    console.log(`   Backing Ratio: ${backingPercentage.toFixed(2)}%`);

    // Check if fix is complete
    if (backingPercentage >= 99.9) {
      console.log('   ✅ BACKING FIX SUCCESSFUL!');
      console.log('   🎉 UUSD is now 100% backed by LUSD');

      if (backingPercentage > 100.1) {
        const excess = Number(lusdBalanceFormatted) - Number(uusdSupplyFormatted);
        console.log(`   💰 Excess LUSD: ${excess.toFixed(6)} LUSD`);
        console.log('   💡 Consider this as safety buffer or future backing');
      }
    } else if (backingPercentage >= 95) {
      console.log('   ⚠️  PARTIAL FIX: Nearly there!');
      const missing = Number(uusdSupplyFormatted) - Number(lusdBalanceFormatted);
      console.log(`   📉 Still missing: ${missing.toFixed(6)} LUSD`);
    } else {
      console.log('   ❌ FIX INCOMPLETE');
      const missing = Number(uusdSupplyFormatted) - Number(lusdBalanceFormatted);
      console.log(`   📉 Missing: ${missing.toFixed(6)} LUSD`);
      console.log(`   💰 Additional deposit needed: ${missing.toFixed(6)} LUSD`);
    }

    // Compare with pre-fix state
    console.log('\n📈 IMPROVEMENT ANALYSIS:');
    const previousBacking = 68.11;
    const improvement = backingPercentage - previousBacking;
    console.log(`   Previous Backing: ${previousBacking}%`);
    console.log(`   Current Backing: ${backingPercentage.toFixed(2)}%`);
    console.log(`   Improvement: +${improvement.toFixed(2)}%`);

    // Risk assessment
    console.log('\n🎯 RISK ASSESSMENT:');
    if (backingPercentage >= 100) {
      console.log('   ✅ ZERO RISK: Full LUSD redemption guaranteed');
      console.log('   ✅ Users can redeem 100% LUSD for their UUSD');
    } else {
      const maxSafeRedemption = (backingPercentage / 100) * Number(uusdSupplyFormatted);
      console.log(`   ⚠️  Limited Risk: ${maxSafeRedemption.toFixed(2)} UUSD can be redeemed for pure LUSD`);
      console.log(`   ⚠️  Remaining ${(Number(uusdSupplyFormatted) - maxSafeRedemption).toFixed(2)} UUSD would get governance tokens`);
    }

    // Recommendations
    console.log('\n💡 RECOMMENDATIONS:');
    if (backingPercentage >= 100) {
      console.log('   ✅ Update protocol documentation to reflect 100% backing');
      console.log('   ✅ Consider setting collateral ratio to 100%');
      console.log('   ✅ Implement monitoring to maintain this level');
    } else {
      const additionalNeeded = Number(uusdSupplyFormatted) - Number(lusdBalanceFormatted);
      console.log(`   📝 Deposit additional ${additionalNeeded.toFixed(6)} LUSD for complete fix`);
      console.log('   📝 Or adjust collateral ratio to match actual backing');
    }

    return {
      uusdSupply: Number(uusdSupplyFormatted),
      lusdBalance: Number(lusdBalanceFormatted),
      backingPercentage,
      isFullyBacked: backingPercentage >= 99.9
    };

  } catch (error) {
    console.error('❌ Error verifying backing fix:', error);
    process.exit(1);
  }
}

// Command line interface
if (import.meta.main) {
  const result = await verifyBackingFix();

  console.log('\n🎯 SUMMARY:');
  if (result.isFullyBacked) {
    console.log('🎉 SUCCESS: UUSD backing has been restored to 100%!');
  } else {
    console.log('⚠️ PARTIAL: More work needed to achieve 100% backing');
  }
}

// Export for use in other scripts
export { verifyBackingFix };
