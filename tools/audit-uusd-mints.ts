/// <reference lib="deno.ns" />
import { createPublicClient, http, parseAbi, formatUnits, getContract, type Address } from 'viem';
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

// Event ABIs for mint/redeem operations
const MINT_REDEEM_EVENTS = parseAbi([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event DollarMinted(address indexed user, uint256 collateralAmount, uint256 dollarAmount)',
  'event DollarRedeemed(address indexed user, uint256 dollarAmount, uint256 collateralAmount)',
  'event AmoMinterBorrow(address indexed amoMinter, uint256 amount)',
  'event AmoMinterRepay(address indexed amoMinter, uint256 amount)',
  'event CollateralRatioSet(uint256 newRatio)'
]);

// Standard ERC20 ABI
const ERC20_ABI = parseAbi([
  'function totalSupply() view returns (uint256)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'event Transfer(address indexed from, address indexed to, uint256 value)'
]);

// Pool functions for getting historical data
const POOL_ABI = parseAbi([
  'function collateralRatio() view returns (uint256)',
  'function freeCollateralBalance(uint256 collateralIndex) view returns (uint256)',
  'function collateralUsdBalance() view returns (uint256 balanceTally)'
]);

interface MintEvent {
  blockNumber: bigint;
  txHash: string;
  timestamp: number;
  user: string;
  uusdAmount: bigint;
  lusdAmount: bigint;
  type: 'mint' | 'redeem' | 'transfer';
}

interface AuditResult {
  totalMints: bigint;
  totalRedeems: bigint;
  totalLusdDeposited: bigint;
  totalLusdWithdrawn: bigint;
  netUusdSupply: bigint;
  netLusdBalance: bigint;
  expectedBackingRatio: number;
  actualBackingRatio: number;
  deficit: bigint;
  events: MintEvent[];
}

async function getBlockTimestamp(blockNumber: bigint): Promise<number> {
  const block = await client.getBlock({ blockNumber });
  return Number(block.timestamp);
}

async function findContractDeploymentBlock(): Promise<bigint> {
  console.log('🔍 Finding UUSD contract deployment block...');

  // Try to find the first transfer event (mint from zero address)
  try {
    const deploymentLogs = await client.getLogs({
      address: UUSD_ADDRESS,
      event: parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])[0],
      fromBlock: 15000000n, // Approximate block around when UUSD might have been deployed
      toBlock: 'latest'
    });

    if (deploymentLogs.length > 0) {
      const firstBlock = deploymentLogs[0].blockNumber;
      console.log(`✅ Found first UUSD activity at block: ${firstBlock}`);
      return firstBlock;
    }
  } catch (error) {
    console.log('⚠️ Could not find deployment block automatically, using fallback');
  }

  // Fallback to a reasonable starting block
  return 18000000n;
}

async function getLogsInChunks(address: Address, eventAbi: any, fromBlock: bigint, toBlock: bigint | 'latest', args?: any): Promise<any[]> {
  const CHUNK_SIZE = 50000n; // Safe chunk size for RPC limits
  const logs: any[] = [];

  const latestBlock = toBlock === 'latest' ? await client.getBlockNumber() : toBlock;
  let currentBlock = fromBlock;

  while (currentBlock <= latestBlock) {
    const chunkEnd = currentBlock + CHUNK_SIZE > latestBlock ? latestBlock : currentBlock + CHUNK_SIZE;

    try {
      console.log(`   Fetching blocks ${currentBlock} to ${chunkEnd}...`);
      const chunkLogs = await client.getLogs({
        address,
        event: eventAbi,
        args,
        fromBlock: currentBlock,
        toBlock: chunkEnd
      });

      logs.push(...chunkLogs);
      console.log(`   Found ${chunkLogs.length} events in this chunk (Total: ${logs.length})`);

    } catch (error) {
      console.log(`   ⚠️ Error fetching chunk ${currentBlock}-${chunkEnd}, skipping...`);
    }

    currentBlock = chunkEnd + 1n;
  }

  return logs;
}

async function auditAllMints(): Promise<AuditResult> {
  console.log('🚨 STARTING COMPREHENSIVE UUSD MINT AUDIT\n');
  console.log(`📍 Analyzing contract: ${UUSD_ADDRESS}`);
  console.log(`📍 Diamond contract: ${DIAMOND_ADDRESS}`);
  console.log(`📍 LUSD collateral: ${LUSD_ADDRESS}\n`);

  const deploymentBlock = await findContractDeploymentBlock();

  console.log('📊 Fetching all UUSD transfer events in chunks...');
  const transferEvent = parseAbi(['event Transfer(address indexed from, address indexed to, uint256 value)'])[0];

  // Get all UUSD transfers (includes mints and burns)
  const uusdTransfers = await getLogsInChunks(UUSD_ADDRESS, transferEvent, deploymentBlock, 'latest');

  console.log(`📈 Found ${uusdTransfers.length} UUSD transfer events`);

  // Get all LUSD transfers to/from diamond contract
  console.log('💰 Fetching LUSD transfers to Diamond contract...');
  const lusdTransfers = await getLogsInChunks(LUSD_ADDRESS, transferEvent, deploymentBlock, 'latest', {
    to: DIAMOND_ADDRESS
  });

  console.log('💰 Fetching LUSD transfers from Diamond contract...');
  const lusdWithdrawals = await getLogsInChunks(LUSD_ADDRESS, transferEvent, deploymentBlock, 'latest', {
    from: DIAMOND_ADDRESS
  });

  console.log(`💰 Found ${lusdTransfers.length} LUSD deposits and ${lusdWithdrawals.length} LUSD withdrawals`);

  // Process events chronologically
  const events: MintEvent[] = [];

  // Process UUSD mints (transfers from zero address)
  console.log('🔄 Processing UUSD mints...');
  let mintCount = 0;
  let totalMints = 0n;

  for (const transfer of uusdTransfers) {
    if (transfer.args.from === '0x0000000000000000000000000000000000000000') {
      const timestamp = await getBlockTimestamp(transfer.blockNumber!);
      events.push({
        blockNumber: transfer.blockNumber!,
        txHash: transfer.transactionHash!,
        timestamp,
        user: transfer.args.to!,
        uusdAmount: transfer.args.value!,
        lusdAmount: 0n, // Will correlate later
        type: 'mint'
      });
      totalMints += transfer.args.value!;
      mintCount++;

      if (mintCount % 100 === 0) {
        console.log(`   Processed ${mintCount} mints...`);
      }
    }
  }

  // Process UUSD burns (transfers to zero address)
  console.log('🔥 Processing UUSD burns/redeems...');
  let burnCount = 0;
  let totalRedeems = 0n;

  for (const transfer of uusdTransfers) {
    if (transfer.args.to === '0x0000000000000000000000000000000000000000') {
      const timestamp = await getBlockTimestamp(transfer.blockNumber!);
      events.push({
        blockNumber: transfer.blockNumber!,
        txHash: transfer.transactionHash!,
        timestamp,
        user: transfer.args.from!,
        uusdAmount: transfer.args.value!,
        lusdAmount: 0n, // Will correlate later
        type: 'redeem'
      });
      totalRedeems += transfer.args.value!;
      burnCount++;

      if (burnCount % 100 === 0) {
        console.log(`   Processed ${burnCount} redeems...`);
      }
    }
  }

  // Calculate LUSD flows
  let totalLusdDeposited = 0n;
  let totalLusdWithdrawn = 0n;

  for (const deposit of lusdTransfers) {
    totalLusdDeposited += deposit.args.value!;
  }

  for (const withdrawal of lusdWithdrawals) {
    totalLusdWithdrawn += withdrawal.args.value!;
  }

  // Sort events by block number
  events.sort((a, b) => Number(a.blockNumber - b.blockNumber));

  // Get current state for comparison
  console.log('📊 Getting current contract state...');

  const [currentUusdSupply, currentLusdBalance] = await Promise.all([
    client.readContract({
      address: UUSD_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'totalSupply'
    }),
    client.readContract({
      address: LUSD_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [DIAMOND_ADDRESS]
    })
  ]);

  // Calculate metrics
  const netUusdSupply = totalMints - totalRedeems;
  const netLusdBalance = totalLusdDeposited - totalLusdWithdrawn;

  const expectedBackingRatio = netLusdBalance > 0n ? Number((netLusdBalance * 100n) / netUusdSupply) : 0;
  const actualBackingRatio = currentUusdSupply > 0n ? Number((currentLusdBalance * 100n) / currentUusdSupply) : 0;

  const deficit = netUusdSupply - netLusdBalance;

  return {
    totalMints,
    totalRedeems,
    totalLusdDeposited,
    totalLusdWithdrawn,
    netUusdSupply,
    netLusdBalance,
    expectedBackingRatio,
    actualBackingRatio,
    deficit,
    events
  };
}

async function analyzeAuditResults(result: AuditResult) {
  console.log('\n🎯 COMPREHENSIVE AUDIT RESULTS\n');
  console.log('=' .repeat(80));

  // Basic metrics
  console.log('📊 MINT/REDEEM SUMMARY:');
  console.log(`   Total UUSD Minted: ${formatUnits(result.totalMints, 18)} UUSD`);
  console.log(`   Total UUSD Redeemed: ${formatUnits(result.totalRedeems, 18)} UUSD`);
  console.log(`   Net UUSD Supply: ${formatUnits(result.netUusdSupply, 18)} UUSD`);
  console.log(`   Total LUSD Deposited: ${formatUnits(result.totalLusdDeposited, 18)} LUSD`);
  console.log(`   Total LUSD Withdrawn: ${formatUnits(result.totalLusdWithdrawn, 18)} LUSD`);
  console.log(`   Net LUSD Balance: ${formatUnits(result.netLusdBalance, 18)} LUSD`);

  // Backing analysis
  console.log('\n💰 BACKING ANALYSIS:');
  console.log(`   Expected Backing Ratio: ${result.expectedBackingRatio.toFixed(2)}%`);
  console.log(`   Actual Backing Ratio: ${result.actualBackingRatio.toFixed(2)}%`);

  if (result.deficit > 0n) {
    console.log(`   🚨 BACKING DEFICIT: ${formatUnits(result.deficit, 18)} tokens`);
    console.log(`   💰 This represents ${formatUnits(result.deficit, 18)} worth of missing backing`);
  } else {
    console.log(`   ✅ SURPLUS: ${formatUnits(-result.deficit, 18)} excess backing`);
  }

  // Timeline analysis
  console.log('\n📅 TIMELINE ANALYSIS:');
  if (result.events.length > 0) {
    const firstEvent = result.events[0];
    const lastEvent = result.events[result.events.length - 1];

    console.log(`   First Activity: Block ${firstEvent.blockNumber} (${new Date(firstEvent.timestamp * 1000).toISOString()})`);
    console.log(`   Latest Activity: Block ${lastEvent.blockNumber} (${new Date(lastEvent.timestamp * 1000).toISOString()})`);
    console.log(`   Total Events: ${result.events.length}`);

    // Show recent significant events
    console.log('\n🔍 RECENT SIGNIFICANT EVENTS (Last 10):');
    const recentEvents = result.events.slice(-10);
    for (const event of recentEvents) {
      const date = new Date(event.timestamp * 1000).toISOString().split('T')[0];
      const amount = formatUnits(event.uusdAmount, 18);
      console.log(`   ${date} | ${event.type.toUpperCase()} | ${amount} UUSD | Block ${event.blockNumber}`);
    }
  }

  // Detailed mismatch analysis
  if (Math.abs(result.expectedBackingRatio - result.actualBackingRatio) > 1) {
    console.log('\n🚨 CRITICAL MISMATCH DETECTED!');
    console.log('   The historical mint/redeem data does not match current contract state.');
    console.log('   Possible causes:');
    console.log('   1. AMO minters borrowed LUSD without corresponding UUSD mints');
    console.log('   2. Direct LUSD transfers out of the contract');
    console.log('   3. Contract upgrades that affected token balances');
    console.log('   4. Missing mint/redeem events in our analysis');
    console.log('   5. LUSD was moved to other contracts/addresses');
  }
}

async function main() {
  try {
    const startTime = Date.now();

    const auditResult = await auditAllMints();
    await analyzeAuditResults(auditResult);

    const endTime = Date.now();
    console.log(`\n⏱️ Audit completed in ${(endTime - startTime) / 1000}s`);

    // Export results to JSON for further analysis
    const jsonResults = {
      ...auditResult,
      // Convert BigInts to strings for JSON serialization
      totalMints: auditResult.totalMints.toString(),
      totalRedeems: auditResult.totalRedeems.toString(),
      totalLusdDeposited: auditResult.totalLusdDeposited.toString(),
      totalLusdWithdrawn: auditResult.totalLusdWithdrawn.toString(),
      netUusdSupply: auditResult.netUusdSupply.toString(),
      netLusdBalance: auditResult.netLusdBalance.toString(),
      deficit: auditResult.deficit.toString(),
      events: auditResult.events.map(e => ({
        ...e,
        blockNumber: e.blockNumber.toString(),
        uusdAmount: e.uusdAmount.toString(),
        lusdAmount: e.lusdAmount.toString()
      }))
    };

    console.log('\n📁 Saving detailed results to audit-results.json...');
    await Deno.writeTextFile('audit-results.json', JSON.stringify(jsonResults, null, 2));

  } catch (error) {
    console.error('❌ Audit failed:', error);
    process.exit(1);
  }
}

// Run the audit
main();
