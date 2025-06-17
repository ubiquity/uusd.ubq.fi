#!/usr/bin/env bun

/**
 * Diamond Contract Reader CLI
 *
 * A minimal CLI tool to read all settings from the deployed diamond contract
 * at 0xED3084c98148e2528DaDCB53C56352e549C488fA using rpc.ubq.fi/1 endpoint.
 */

import { CLI_COMMANDS } from './config.ts';
import { parseArgs, isValidCommand, showHelp, showInvalidCommand, showConnectionInfo, showLoading, showSectionHeader } from './cli-utils.ts';
import {
    createContractReader,
    testConnection,
    handleContractError,
    readAllSettings,
    readCollateralInfo,
    readRatios,
    readPrices,
    readSystemStatus,
    formatPrice,
    formatRatio,
    formatStatus,
    formatAddress,
    formatAmount
} from './contract-reader.ts';

/**
 * Execute the specified command
 */
async function executeCommand(command: string, client: any, verbose: boolean): Promise<void> {
    switch (command) {
        case CLI_COMMANDS.ALL:
            await displayAllSettings(client, verbose);
            break;
        case CLI_COMMANDS.COLLATERAL_INFO:
            await displayCollateralInfo(client, verbose);
            break;
        case CLI_COMMANDS.RATIOS:
            await displayRatios(client, verbose);
            break;
        case CLI_COMMANDS.PRICES:
            await displayPrices(client, verbose);
            break;
        case CLI_COMMANDS.SYSTEM_STATUS:
            await displaySystemStatus(client, verbose);
            break;
        default:
            console.log('Unknown command - this should not happen');
    }
}

/**
 * Main CLI entry point
 */
async function main(): Promise<void> {
    try {
        const args = parseArgs();

        // Show help if requested or no valid command provided
        if (args.help || args.command === CLI_COMMANDS.HELP) {
            showHelp();
            return;
        }

        // Validate command
        if (!isValidCommand(args.command)) {
            showInvalidCommand(args.command);
            process.exit(1);
        }

        // Connect to the network
        showLoading('Connecting to Ethereum mainnet...');
        const client = createContractReader();

        // Test connection
        const { blockNumber, chainId } = await testConnection(client);
        showConnectionInfo(blockNumber, chainId);

        // Execute the requested command
        await executeCommand(args.command, client, args.verbose);

    } catch (error) {
        handleContractError(error, 'during execution');
    }
}

/**
 * Command implementations with comprehensive contract reading
 */
async function displayAllSettings(client: any, verbose: boolean): Promise<void> {
    console.log('📊 Reading all diamond contract settings...');
    console.log();

    const data = await readAllSettings(client);

    // System Information
    showSectionHeader('System Information');
    console.log(`Dollar Token:      ${formatAddress(data.system.dollarToken)}`);
    console.log(`Governance Token:  ${formatAddress(data.system.governanceToken)}`);
    console.log(`Target Price:      ${formatPrice(data.system.targetPrice)}`);
    console.log(`Total Supply:      ${formatAmount(data.system.totalSupply)} UUSD`);
    console.log();

    // Ratios
    showSectionHeader('Current Ratios');
    console.log(`Collateral Ratio:  ${formatRatio(data.ratios.collateralRatio)}`);
    console.log();

    // Prices
    showSectionHeader('Current Prices');
    console.log(`Governance Price:  ${formatPrice(data.prices.governancePrice)}`);
    console.log(`Target Price:      ${formatPrice(data.prices.targetPrice)}`);
    console.log();

    // Collateral Information
    showSectionHeader('Collateral Information');
    for (const collateral of data.collaterals) {
        console.log(`${collateral[1]} (${formatAddress(collateral.address)}):`);
        console.log(`  Index:           ${collateral[0]}`);
        console.log(`  Enabled:         ${formatStatus(collateral[5])}`);
        console.log(`  Current Price:   ${formatPrice(collateral[7])}`);
        console.log(`  Pool Ceiling:    ${formatAmount(collateral[8])} UUSD`);
        console.log(`  Mint Paused:     ${collateral[9] ? '❌ Yes' : '✅ No'}`);
        console.log(`  Redeem Paused:   ${collateral[10] ? '❌ Yes' : '✅ No'}`);
        console.log(`  Minting Fee:     ${formatRatio(collateral[12])}`);
        console.log(`  Redemption Fee:  ${formatRatio(collateral[13])}`);
        console.log();
    }
}

async function displayCollateralInfo(client: any, verbose: boolean): Promise<void> {
    console.log('💰 Reading collateral information...');
    console.log();

    const collaterals = await readCollateralInfo(client);

    showSectionHeader('Detailed Collateral Information');

    for (const collateral of collaterals) {
        console.log(`${collateral[1]} - ${collateral[2]}`);
        console.log(`  Index:                 ${collateral[0]}`);
        console.log(`  Address:               ${formatAddress(collateral.address)}`);
        console.log(`  Price Feed:            ${formatAddress(collateral[3])}`);
        console.log(`  Staleness Threshold:   ${collateral[4]} seconds`);
        console.log(`  Status:                ${formatStatus(collateral[5])}`);
        console.log(`  Missing Decimals:      ${collateral[6]}`);
        console.log(`  Current Price:         ${formatPrice(collateral[7])}`);
        console.log(`  Pool Ceiling:          ${formatAmount(collateral[8])} UUSD`);
        console.log(`  Mint Status:           ${collateral[9] ? '❌ Paused' : '✅ Active'}`);
        console.log(`  Redeem Status:         ${collateral[10] ? '❌ Paused' : '✅ Active'}`);
        console.log(`  Borrow Status:         ${collateral[11] ? '❌ Paused' : '✅ Active'}`);
        console.log(`  Minting Fee:           ${formatRatio(collateral[12])}`);
        console.log(`  Redemption Fee:        ${formatRatio(collateral[13])}`);
        console.log();
    }
}

async function displayRatios(client: any, verbose: boolean): Promise<void> {
    console.log('📈 Reading system ratios...');
    console.log();

    const ratios = await readRatios(client);

    showSectionHeader('System Ratios');
    console.log(`Collateral Ratio:      ${formatRatio(ratios.collateralRatio)}`);
    console.log(`Target Price:          ${formatPrice(ratios.targetPrice)}`);

    // Calculate derived ratios
    const collateralPercent = Number(ratios.collateralRatio) / 10000; // Convert from basis points
    const governancePercent = 100 - collateralPercent;

    console.log();
    console.log('Ratio Breakdown:');
    console.log(`  Collateral Coverage:   ${collateralPercent.toFixed(2)}%`);
    console.log(`  Governance Coverage:   ${governancePercent.toFixed(2)}%`);

    if (collateralPercent === 100) {
        console.log('  Mode:                  🔒 Full Collateral Mode');
    } else if (collateralPercent === 0) {
        console.log('  Mode:                  🏛️ Pure Governance Mode');
    } else {
        console.log('  Mode:                  ⚖️ Mixed Collateral Mode');
    }
    console.log();
}

async function displayPrices(client: any, verbose: boolean): Promise<void> {
    console.log('💲 Reading current prices...');
    console.log();

    const prices = await readPrices(client);

    showSectionHeader('System Prices');
    console.log(`Governance Token:      ${formatPrice(prices.governancePrice)}`);
    console.log(`Target Price:          ${formatPrice(prices.targetPrice)}`);
    console.log();

    showSectionHeader('Collateral Prices');
    for (const collateral of prices.collateralPrices) {
        console.log(`${collateral.symbol}:`.padEnd(20) + `${formatPrice(collateral.price)}`);
    }
    console.log();
}

async function displaySystemStatus(client: any, verbose: boolean): Promise<void> {
    console.log('🔍 Reading system status...');
    console.log();

    const status = await readSystemStatus(client);

    showSectionHeader('System Status Overview');

    let totalEnabled = 0;
    let totalMintPaused = 0;
    let totalRedeemPaused = 0;

    for (const collateral of status.collateralStatuses) {
        if (collateral.isEnabled) totalEnabled++;
        if (collateral.isMintPaused) totalMintPaused++;
        if (collateral.isRedeemPaused) totalRedeemPaused++;
    }

    console.log(`Total Collaterals:     ${status.collateralStatuses.length}`);
    console.log(`Enabled Collaterals:   ${totalEnabled}`);
    console.log(`Mint Paused:           ${totalMintPaused}`);
    console.log(`Redeem Paused:         ${totalRedeemPaused}`);
    console.log();

    showSectionHeader('Individual Collateral Status');
    for (const collateral of status.collateralStatuses) {
        console.log(`${collateral.symbol} (${formatAddress(collateral.address)}):`);
        console.log(`  Enabled:         ${formatStatus(collateral.isEnabled)}`);
        console.log(`  Mint Status:     ${collateral.isMintPaused ? '❌ Paused' : '✅ Active'}`);
        console.log(`  Redeem Status:   ${collateral.isRedeemPaused ? '❌ Paused' : '✅ Active'}`);
        console.log(`  Borrow Status:   ${collateral.isBorrowPaused ? '❌ Paused' : '✅ Active'}`);
        console.log(`  Pool Ceiling:    ${formatAmount(collateral.poolCeiling)} UUSD`);
        console.log();
    }
}

// Execute main function
if (import.meta.main) {
    main().catch((error) => {
        handleContractError(error, 'during startup');
    });
}