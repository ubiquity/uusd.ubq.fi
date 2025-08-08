/// <reference lib="deno.ns" />
import { createPublicClient, http, formatUnits, parseUnits, type Address } from 'viem';
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

async function calculateDepositAmount() {
  console.log('🧮 CALCULATING EXACT DEPOSIT AMOUNT NEEDED\n');

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

    console.log('📊 CURRENT STATE:');
    console.log(`   UUSD Total Supply: ${uusdSupplyFormatted} UUSD`);
    console.log(`   LUSD in Diamond: ${lusdBalanceFormatted} LUSD`);

    // Calculate needed amount
    const deficit = Number(uusdSupplyFormatted) - Number(lusdBalanceFormatted);
    const deficitWei = uusdSupply - lusdBalance;

    // Add a small safety buffer (0.1%)
    const safetyBuffer = deficit * 0.001;
    const totalWithBuffer = deficit + safetyBuffer;
    const totalWeiWithBuffer = deficitWei + (deficitWei / 1000n);

    console.log('\n💰 DEPOSIT CALCULATION:');
    if (deficit > 0) {
      console.log(`   Deficit: ${deficit.toFixed(6)} LUSD`);
      console.log(`   Exact Amount Needed: ${deficit.toFixed(18)} LUSD`);
      console.log(`   Wei Amount: ${deficitWei.toString()}`);

      console.log('\n🛡️ WITH SAFETY BUFFER (0.1%):');
      console.log(`   Recommended Deposit: ${totalWithBuffer.toFixed(6)} LUSD`);
      console.log(`   Wei Amount: ${totalWeiWithBuffer.toString()}`);

      // Provide exact commands
      console.log('\n🔧 EXACT COMMANDS TO RUN:');
      console.log('```bash');
      console.log('# Check your LUSD balance first');
      console.log(`cast call ${LUSD_ADDRESS} "balanceOf(address)" <YOUR_ADDRESS>`);
      console.log('');
      console.log('# Approve the exact amount');
      console.log(`cast send ${LUSD_ADDRESS} \\`);
      console.log('  "approve(address,uint256)" \\');
      console.log(`  ${DIAMOND_ADDRESS} \\`);
      console.log(`  ${totalWeiWithBuffer.toString()} \\`);
      console.log('  --private-key <YOUR_PRIVATE_KEY>');
      console.log('');
      console.log('# Transfer the exact amount');
      console.log(`cast send ${LUSD_ADDRESS} \\`);
      console.log('  "transfer(address,uint256)" \\');
      console.log(`  ${DIAMOND_ADDRESS} \\`);
      console.log(`  ${totalWeiWithBuffer.toString()} \\`);
      console.log('  --private-key <YOUR_PRIVATE_KEY>');
      console.log('```');

    } else {
      console.log(`   ✅ No deposit needed! Excess: ${Math.abs(deficit).toFixed(6)} LUSD`);
      console.log('   🎉 UUSD is already fully backed or over-backed');
    }

    // Calculate current backing percentage
    const backingPercentage = uusdSupply > 0n ? Number((lusdBalance * 10000n) / uusdSupply) / 100 : 0;
    console.log(`\n📈 Current Backing: ${backingPercentage.toFixed(4)}%`);

    return {
      deficit,
      deficitWei: deficitWei.toString(),
      recommendedAmount: deficit > 0 ? deficit + (deficit * 0.001) : 0,
      recommendedWei: totalWeiWithBuffer.toString(),
      isFullyBacked: deficit <= 0
    };

  } catch (error) {
    console.error('❌ Error calculating deposit amount:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.main) {
  await calculateDepositAmount();
}

export { calculateDepositAmount };
