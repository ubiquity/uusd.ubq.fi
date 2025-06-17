/**
 * CLI utilities for argument parsing and help display
 */

import { CLI_COMMANDS, CONTRACT_ADDRESSES, RPC_CONFIG, DISPLAY_CONFIG } from './config.ts';

/**
 * Parsed CLI arguments interface
 */
export interface CliArgs {
    command: string;
    help: boolean;
    verbose: boolean;
}

/**
 * Parse command line arguments
 */
export function parseArgs(): CliArgs {
    const args = process.argv.slice(2);

    return {
        command: args[0] || CLI_COMMANDS.HELP,
        help: args.includes('--help') || args.includes('-h'),
        verbose: args.includes('--verbose') || args.includes('-v')
    };
}

/**
 * Validate if command is supported
 */
export function isValidCommand(command: string): boolean {
    const validCommands = Object.values(CLI_COMMANDS);
    return validCommands.includes(command);
}

/**
 * Display help information
 */
export function showHelp(): void {
    console.log(`
${DISPLAY_CONFIG.SYMBOLS.DATA} Diamond Contract Reader CLI

USAGE:
    bun run tools/diamond-reader.ts [COMMAND] [OPTIONS]

COMMANDS:
    help                    Show this help message
    ${CLI_COMMANDS.ALL}                   Read all diamond contract settings
    ${CLI_COMMANDS.COLLATERAL_INFO}       Read collateral information
    ${CLI_COMMANDS.RATIOS}               Read collateral and governance ratios
    ${CLI_COMMANDS.PRICES}               Read current prices
    ${CLI_COMMANDS.SYSTEM_STATUS}        Read system status information

OPTIONS:
    --help, -h             Show help information
    --verbose, -v          Show detailed output

EXAMPLES:
    bun run tools/diamond-reader.ts --help
    bun run tools/diamond-reader.ts ${CLI_COMMANDS.ALL}
    bun run tools/diamond-reader.ts ${CLI_COMMANDS.COLLATERAL_INFO} --verbose

CONTRACT INFORMATION:
    ${DISPLAY_CONFIG.SYMBOLS.INFO} Diamond Address: ${CONTRACT_ADDRESSES.DIAMOND}
    ${DISPLAY_CONFIG.SYMBOLS.INFO} Network: Ethereum mainnet (${RPC_CONFIG.endpoint})
    ${DISPLAY_CONFIG.SYMBOLS.INFO} Chain ID: ${RPC_CONFIG.chain.id}

DESCRIPTION:
    This CLI tool reads settings and information from the deployed Ubiquity USD
    diamond contract on the Ethereum mainnet. It provides read-only access to:

    • Collateral information and configuration
    • System ratios and prices
    • Contract status and parameters
    • Real-time blockchain data
`);
}

/**
 * Display error message for invalid commands
 */
export function showInvalidCommand(command: string): void {
    console.error(`${DISPLAY_CONFIG.SYMBOLS.ERROR} Invalid command: ${command}`);
    console.error(`   Run 'bun run tools/diamond-reader.ts --help' for available commands`);
}

/**
 * Display connection info
 */
export function showConnectionInfo(blockNumber: bigint, chainId: number): void {
    console.log(`${DISPLAY_CONFIG.SYMBOLS.SUCCESS} Connected to Ethereum mainnet (block: ${blockNumber})`);
    console.log(`${DISPLAY_CONFIG.SYMBOLS.INFO} Chain ID: ${chainId}`);
    console.log(`${DISPLAY_CONFIG.SYMBOLS.INFO} Diamond contract: ${CONTRACT_ADDRESSES.DIAMOND}`);
    console.log();
}

/**
 * Display section header
 */
export function showSectionHeader(title: string): void {
    console.log(`${DISPLAY_CONFIG.SYMBOLS.DATA} ${title}`);
    console.log(''.padEnd(title.length + 2, '─'));
}

/**
 * Display loading message
 */
export function showLoading(message: string): void {
    console.log(`${DISPLAY_CONFIG.SYMBOLS.LOADING} ${message}`);
}

/**
 * Display success message
 */
export function showSuccess(message: string): void {
    console.log(`${DISPLAY_CONFIG.SYMBOLS.SUCCESS} ${message}`);
}

/**
 * Display error message
 */
export function showError(message: string): void {
    console.error(`${DISPLAY_CONFIG.SYMBOLS.ERROR} ${message}`);
}