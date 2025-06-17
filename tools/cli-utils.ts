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

    // If no arguments provided, use default behavior
    if (args.length === 0) {
        return {
            command: CLI_COMMANDS.DEFAULT,
            help: false,
            verbose: false
        };
    }

    // Check for specific flags
    if (args.includes('--help') || args.includes('-h')) {
        return {
            command: CLI_COMMANDS.HELP,
            help: true,
            verbose: false
        };
    }

    if (args.includes(CLI_COMMANDS.DISCOVER_ONLY)) {
        return {
            command: CLI_COMMANDS.DISCOVER_ONLY,
            help: false,
            verbose: args.includes('--verbose') || args.includes('-v')
        };
    }

    if (args.includes(CLI_COMMANDS.CLEAR_CACHE)) {
        return {
            command: CLI_COMMANDS.CLEAR_CACHE,
            help: false,
            verbose: false
        };
    }

    if (args.includes(CLI_COMMANDS.CACHE_INFO)) {
        return {
            command: CLI_COMMANDS.CACHE_INFO,
            help: false,
            verbose: false
        };
    }

    // Default behavior - discover and call functions
    return {
        command: CLI_COMMANDS.DEFAULT,
        help: false,
        verbose: args.includes('--verbose') || args.includes('-v')
    };
}

/**
 * Validate if command is supported
 */
export function isValidCommand(command: string): boolean {
    const validCommands = Object.values(CLI_COMMANDS) as string[];
    return validCommands.includes(command);
}

/**
 * Display help information
 */
export function showHelp(): void {
    console.log(`
${DISPLAY_CONFIG.SYMBOLS.DATA} Diamond Contract Reader CLI

USAGE:
    bun run tools/diamond-reader.ts [OPTIONS]

COMMANDS:
    (no arguments)          Auto-discover and call all diamond functions (default)
    ${CLI_COMMANDS.DISCOVER_ONLY}        Discover and list all view/pure functions without calling them
    ${CLI_COMMANDS.CLEAR_CACHE}         Clear all cached data and exit
    ${CLI_COMMANDS.CACHE_INFO}          Show cache status information

OPTIONS:
    --help, -h             Show help information
    --verbose, -v          Show detailed output including failed function calls

EXAMPLES:
    bun run tools/diamond-reader.ts
    bun run tools/diamond-reader.ts --help
    bun run tools/diamond-reader.ts ${CLI_COMMANDS.DISCOVER_ONLY}
    bun run tools/diamond-reader.ts ${CLI_COMMANDS.DISCOVER_ONLY} --verbose
    bun run tools/diamond-reader.ts ${CLI_COMMANDS.CLEAR_CACHE}
    bun run tools/diamond-reader.ts ${CLI_COMMANDS.CACHE_INFO}

CONTRACT INFORMATION:
    ${DISPLAY_CONFIG.SYMBOLS.INFO} Diamond Address: ${CONTRACT_ADDRESSES.DIAMOND}
    ${DISPLAY_CONFIG.SYMBOLS.INFO} Network: Ethereum mainnet (${RPC_CONFIG.endpoint})

DESCRIPTION:
    This CLI tool dynamically discovers and interacts with all available functions
    from the deployed Ubiquity USD diamond contract on Ethereum mainnet.

    • Automatically discovers all facets and their functions (cached permanently)
    • Calls all safe view/pure functions with intelligent parameter generation
    • Uses efficient batch JSON-RPC calls to your RPC endpoint
    • Provides comprehensive contract state analysis
    • Organizes results by facet for easy understanding
    • Much faster than manually checking each facet on Etherscan
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
