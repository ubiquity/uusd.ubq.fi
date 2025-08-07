import { createPublicClient, http, formatUnits, type Address } from 'viem';
import { mainnet } from 'viem/chains';

// Configuration
const RPC_URL = 'https://rpc.ubq.fi/1';
const DIAMOND_ADDRESS = '0xED3084c98148e2528DaDCB53C56352e549C488fA' as Address;

// Minimal ABI for the functions we need
const UBIQUITY_POOL_ABI = [
  {
    inputs: [],
    name: 'collateralRatio',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'allCollaterals',
    outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'address', name: 'collateralAddress', type: 'address' }],
    name: 'collateralInformation',
    outputs: [
      {
        components: [
          { internalType: 'uint256', name: 'index', type: 'uint256' },
          { internalType: 'string', name: 'symbol', type: 'string' },
          { internalType: 'address', name: 'collateralAddress', type: 'address' },
          { internalType: 'address', name: 'collateralPriceFeedAddress', type: 'address' },
          { internalType: 'uint256', name: 'collateralPriceFeedStalenessThreshold', type: 'uint256' },
          { internalType: 'bool', name: 'isEnabled', type: 'bool' },
          { internalType: 'uint256', name: 'missingDecimals', type: 'uint256' },
          { internalType: 'uint256', name: 'price', type: 'uint256' },
          { internalType: 'uint256', name: 'poolCeiling', type: 'uint256' },
          { internalType: 'bool', name: 'isMintPaused', type: 'bool' },
          { internalType: 'bool', name: 'isRedeemPaused', type: 'bool' },
          { internalType: 'bool', name: 'isBorrowPaused', type: 'bool' },
          { internalType: 'uint256', name: 'mintingFee', type: 'uint256' },
          { internalType: 'uint256', name: 'redemptionFee', type: 'uint256' }
        ],
        internalType: 'struct LibUbiquityPool.CollateralInformation',
        name: 'returnData',
        type: 'tuple'
      }
    ],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [],
    name: 'getDollarPriceUsd',
    outputs: [{ internalType: 'uint256', name: 'dollarPriceUsd', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  }
] as const;

// Create viem client
const client = createPublicClient({
  chain: mainnet,
  transport: http(RPC_URL)
});

async function checkCollateralRatio() {
  try {
    console.log('🔍 Checking Ubiquity Dollar Protocol Status...\n');
    console.log(`📍 Contract Address: ${DIAMOND_ADDRESS}`);
    console.log(`🌐 RPC Endpoint: ${RPC_URL}\n`);

    // Get network info
    const [blockNumber, chainId] = await Promise.all([
      client.getBlockNumber(),
      client.getChainId()
    ]);

    console.log(`⛓️  Network: Chain ID ${chainId}`);
    console.log(`📦 Current Block: ${blockNumber}\n`);

    // Get collateral ratio
    console.log('📊 COLLATERAL RATIO:');
    const collateralRatio = await client.readContract({
      address: DIAMOND_ADDRESS,
      abi: UBIQUITY_POOL_ABI,
      functionName: 'collateralRatio'
    }) as bigint;

    const ratioFormatted = formatUnits(collateralRatio, 6);
    const ratioPercentage = (parseFloat(ratioFormatted) * 100).toFixed(2);

    console.log(`   Raw Value: ${collateralRatio.toString()}`);
    console.log(`   Formatted: ${ratioFormatted}`);
    console.log(`   Percentage: ${ratioPercentage}%`);

    // Check if it's at 100%
    const isAtHundredPercent = collateralRatio >= 1000000n;
    console.log(`   Is >= 100%: ${isAtHundredPercent ? '✅ YES' : '❌ NO'}`);

    if (isAtHundredPercent) {
      console.log('\n🎉 GREAT NEWS! The collateral ratio is at or above 100%');
      console.log('   This means when you redeem UUSD, you will receive:');
      console.log('   ✅ ONLY collateral (LUSD)');
      console.log('   ❌ NO UBQ governance tokens');
    } else {
      console.log('\n⚠️  The collateral ratio is below 100%');
      console.log('   This means when you redeem UUSD, you will receive:');
      console.log(`   📊 ${ratioPercentage}% collateral (LUSD)`);
      console.log(`   📊 ${(100 - parseFloat(ratioPercentage)).toFixed(2)}% UBQ governance tokens`);
    }

    // Get current Dollar price
    console.log('\n💰 DOLLAR PRICE:');
    try {
      const dollarPrice = await client.readContract({
        address: DIAMOND_ADDRESS,
        abi: UBIQUITY_POOL_ABI,
        functionName: 'getDollarPriceUsd'
      }) as bigint;

      const dollarPriceFormatted = formatUnits(dollarPrice, 6);
      console.log(`   Current UUSD Price: $${dollarPriceFormatted}`);
    } catch (error) {
      console.log(`   ❌ Could not fetch dollar price: ${error}`);
    }

    // Get collateral information
    console.log('\n🏦 COLLATERAL TOKENS:');
    try {
      const collaterals = await client.readContract({
        address: DIAMOND_ADDRESS,
        abi: UBIQUITY_POOL_ABI,
        functionName: 'allCollaterals'
      }) as Address[];

      console.log(`   Found ${collaterals.length} collateral token(s):`);

      for (let i = 0; i < collaterals.length; i++) {
        const collateralAddress = collaterals[i] as Address;
        try {
          const info = await client.readContract({
            address: DIAMOND_ADDRESS,
            abi: UBIQUITY_POOL_ABI,
            functionName: 'collateralInformation',
            args: [collateralAddress]
          }) as any;

          console.log(`\n   ${i + 1}. ${info.symbol} (${collateralAddress})`);
          console.log(`      Enabled: ${info.isEnabled ? '✅' : '❌'}`);
          console.log(`      Mint Paused: ${info.isMintPaused ? '⏸️  YES' : '▶️  NO'}`);
          console.log(`      Redeem Paused: ${info.isRedeemPaused ? '⏸️  YES' : '▶️  NO'}`);
          console.log(`      Price: $${formatUnits(info.price, 6)}`);
          console.log(`      Pool Ceiling: ${formatUnits(info.poolCeiling, 18)}`);
        } catch (error) {
          console.log(`   ❌ Could not fetch info for ${collateralAddress}: ${error}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Could not fetch collaterals: ${error}`);
    }

  } catch (error) {
    console.error('❌ Error checking collateral ratio:', error);
    process.exit(1);
  }
}

// Run the check
checkCollateralRatio();
