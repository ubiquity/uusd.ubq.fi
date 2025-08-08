import { createPublicClient, http, formatUnits, type Address } from 'viem';
import { mainnet } from 'viem/chains';

// Configuration
const RPC_URL = 'https://rpc.ubq.fi/1';
const DIAMOND_ADDRESS = '0xED3084c98148e2528DaDCB53C56352e549C488fA' as Address;
const LUSD_ADDRESS = '0x5f98805A4E8be255a32880FDeC7F6728C6568bA0' as Address;

// UUSD token address - NEW ADDRESS PROVIDED BY USER
const UUSD_ADDRESS = '0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103' as Address;

// ABIs for specific functions we need
const UBIQUITY_POOL_ABI = [
  {
    inputs: [],
    name: 'collateralRatio',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'collateralIndex', type: 'uint256' }],
    name: 'freeCollateralBalance',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'collateralUsdBalance',
    outputs: [{ internalType: 'uint256', name: 'balanceTally', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getDollarPriceUsd',
    outputs: [{ internalType: 'uint256', name: 'dollarPriceUsd', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'allCollaterals',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

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
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'symbol',
    outputs: [{ internalType: 'string', name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// Create viem client
const client = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL)
});

async function investigateBacking() {
  try {
    console.log('🔍 INVESTIGATING UBIQUITY DOLLAR BACKING DISCREPANCY\n');
    console.log(`📍 Diamond Contract: ${DIAMOND_ADDRESS}`);
    console.log(`📍 LUSD Address: ${LUSD_ADDRESS}`);
    console.log(`📍 UUSD Address: ${UUSD_ADDRESS}\n`);

    // Step 1: Get basic token info
    console.log('💰 GATHERING TOKEN BALANCES...\n');

    // Get LUSD balance in the diamond contract
    const lusdBalance = await client.readContract({
      address: LUSD_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [DIAMOND_ADDRESS]
    }) as bigint;

    // Get UUSD total supply
    const uusdTotalSupply = await client.readContract({
      address: UUSD_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'totalSupply'
    }) as bigint;

    // Get token decimals
    const [lusdDecimals, uusdDecimals] = await Promise.all([
      client.readContract({
        address: LUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'decimals'
      }) as Promise<number>,
      client.readContract({
        address: UUSD_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'decimals'
      }) as Promise<number>
    ]);

    // Format the balances
    const lusdBalanceFormatted = formatUnits(lusdBalance, lusdDecimals);
    const uusdSupplyFormatted = formatUnits(uusdTotalSupply, uusdDecimals);

    console.log('💰 TOKEN BALANCES:');
    console.log(`   LUSD in Diamond: ${lusdBalanceFormatted} LUSD`);
    console.log(`   UUSD Total Supply: ${uusdSupplyFormatted} UUSD`);

    // Calculate actual backing ratio (manual calculation)
    console.log('\n📊 ACTUAL BACKING CALCULATION:');
    if (uusdTotalSupply > 0n) {
      // Convert to same precision for comparison
      const backingRatio = (lusdBalance * 1000000n) / uusdTotalSupply;
      const backingPercentage = Number(backingRatio) / 10000;

      console.log(`   Formula: (LUSD Balance / UUSD Supply) * 1,000,000`);
      console.log(`   Raw Ratio: ${backingRatio.toString()}`);
      console.log(`   Percentage: ${backingPercentage.toFixed(4)}%`);

      if (backingPercentage >= 100) {
        console.log(`   ✅ FULLY BACKED! Actual backing is ${backingPercentage.toFixed(4)}%`);
      } else {
        console.log(`   ❌ UNDER-COLLATERALIZED: Only ${backingPercentage.toFixed(4)}% backed`);
        const missingLusd = Number(uusdSupplyFormatted) - Number(lusdBalanceFormatted);
        console.log(`   💰 Missing: ${missingLusd.toFixed(6)} LUSD worth of backing`);
      }
    } else {
      console.log(`   ⚠️  No UUSD supply found`);
    }

    // Step 2: Get protocol's collateral ratio
    console.log('\n📊 PROTOCOL COLLATERAL RATIO:');
    try {
      const protocolCollateralRatio = await client.readContract({
        address: DIAMOND_ADDRESS,
        abi: UBIQUITY_POOL_ABI,
        functionName: 'collateralRatio'
      }) as bigint;

      const protocolPercentage = Number(protocolCollateralRatio) / 10000;
      console.log(`   Protocol Setting: ${protocolCollateralRatio.toString()} (${protocolPercentage}%)`);

      // Compare with actual backing
      if (uusdTotalSupply > 0n) {
        const actualBackingRatio = (lusdBalance * 1000000n) / uusdTotalSupply;
        const actualPercentage = Number(actualBackingRatio) / 10000;

        const difference = actualPercentage - protocolPercentage;
        console.log(`   Actual Backing: ${actualPercentage.toFixed(4)}%`);
        console.log(`   Difference: ${difference.toFixed(4)}% (${difference > 0 ? 'Over' : 'Under'}-reported)`);

        if (Math.abs(difference) > 0.1) {
          console.log(`   🚨 MAJOR DISCREPANCY DETECTED!`);
          if (actualPercentage > protocolPercentage) {
            console.log(`   💡 Protocol is reporting LOWER ratio than reality`);
            console.log(`   💡 This means redemptions give LESS collateral than they should!`);
          } else {
            console.log(`   💡 Protocol is reporting HIGHER ratio than reality`);
            console.log(`   💡 This means actual backing is worse than reported`);
          }
        }
      }
    } catch (error) {
      console.log(`   ❌ Could not fetch protocol collateral ratio: ${error}`);
    }

    // Step 3: Check free collateral vs total collateral
    console.log('\n🔒 COLLATERAL AVAILABILITY:');
    try {
      const freeCollateralBalance = await client.readContract({
        address: DIAMOND_ADDRESS,
        abi: UBIQUITY_POOL_ABI,
        functionName: 'freeCollateralBalance',
        args: [0n] // LUSD is typically index 0
      }) as bigint;

      const freeCollateralFormatted = formatUnits(freeCollateralBalance, lusdDecimals);
      const lockedAmount = Number(lusdBalanceFormatted) - Number(freeCollateralFormatted);

      console.log(`   Total LUSD in Contract: ${lusdBalanceFormatted} LUSD`);
      console.log(`   Free Collateral: ${freeCollateralFormatted} LUSD`);
      console.log(`   Locked/Reserved: ${lockedAmount.toFixed(6)} LUSD`);

      if (lockedAmount > 0.000001) {
        console.log(`   ⚠️  WARNING: ${lockedAmount.toFixed(6)} LUSD is locked/reserved`);
        console.log(`   💡 This could explain the collateral ratio discrepancy`);
      } else {
        console.log(`   ✅ All LUSD appears to be free (confirming no AMO borrowing)`);
      }
    } catch (error) {
      console.log(`   ❌ Could not fetch free collateral balance: ${error}`);
    }

    // Step 4: Get protocol's USD balance calculation
    console.log('\n💵 PROTOCOL USD BALANCE:');
    try {
      const protocolUsdBalance = await client.readContract({
        address: DIAMOND_ADDRESS,
        abi: UBIQUITY_POOL_ABI,
        functionName: 'collateralUsdBalance'
      }) as bigint;

      const protocolUsdFormatted = formatUnits(protocolUsdBalance, 18);
      console.log(`   Protocol USD Calculation: ${protocolUsdFormatted} USD`);
      console.log(`   Expected (LUSD Balance): ${lusdBalanceFormatted} USD`);

      const usdDifference = Number(protocolUsdFormatted) - Number(lusdBalanceFormatted);
      if (Math.abs(usdDifference) > 0.01) {
        console.log(`   ⚠️  USD Balance Difference: ${usdDifference.toFixed(6)} USD`);
        console.log(`   💡 Protocol may be using different price feeds or calculations`);
      } else {
        console.log(`   ✅ USD calculations match LUSD balance`);
      }
    } catch (error) {
      console.log(`   ❌ Could not fetch protocol USD balance: ${error}`);
    }

    // Step 5: Check current dollar price
    console.log('\n💰 DOLLAR PRICE STATUS:');
    try {
      const dollarPrice = await client.readContract({
        address: DIAMOND_ADDRESS,
        abi: UBIQUITY_POOL_ABI,
        functionName: 'getDollarPriceUsd'
      }) as bigint;

      const dollarPriceFormatted = formatUnits(dollarPrice, 6);
      console.log(`   Current UUSD Price: $${dollarPriceFormatted}`);

      if (Number(dollarPriceFormatted) < 0.999) {
        console.log(`   📉 UUSD is trading below peg (depressed)`);
      } else if (Number(dollarPriceFormatted) > 1.001) {
        console.log(`   📈 UUSD is trading above peg (premium)`);
      } else {
        console.log(`   ✅ UUSD is trading near peg`);
      }
    } catch (error) {
      console.log(`   ❌ Could not fetch dollar price: ${error}`);
    }

    // Final Summary
    console.log('\n🎯 INVESTIGATION SUMMARY:');

    if (uusdTotalSupply > 0n) {
      const actualBackingRatio = (lusdBalance * 1000000n) / uusdTotalSupply;
      const actualPercentage = Number(actualBackingRatio) / 10000;

      console.log(`   📊 Actual LUSD Backing: ${actualPercentage.toFixed(4)}%`);

      if (actualPercentage >= 100) {
        console.log(`   ✅ Your assumption is CORRECT: Every UUSD has LUSD backing`);
        console.log(`   🎉 You should be able to redeem for pure LUSD collateral`);
        console.log(`   ❓ The 95% collateral ratio appears to be a protocol setting issue`);
      } else {
        console.log(`   ❌ There is indeed insufficient LUSD backing`);
        console.log(`   💰 Missing ${((100 - actualPercentage) * Number(uusdSupplyFormatted) / 100).toFixed(6)} LUSD`);
      }
    }

  } catch (error) {
    console.error('❌ Error investigating backing:', error);
    process.exit(1);
  }
}

// Run the investigation
investigateBacking();
