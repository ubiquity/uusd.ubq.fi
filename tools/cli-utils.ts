import { program } from 'commander';
import { formatEther, isAddress } from 'viem';
import { CLI_COMMANDS, type Command } from './config.ts';

/**
 * Parse command-line arguments
 */
export function parseArgs(): { command: Command; verbose: boolean } {
    program
        .option('-v, --verbose', 'Enable verbose output')
        .option('--discover-only', 'Discover functions without calling them')
        .option('--clear-cache', 'Clear all cached data')
        .option('--cache-info', 'Display cache status');

    program.parse(process.argv);
    const options = program.opts();

    let command: Command = CLI_COMMANDS.DEFAULT;
    if (options.discoverOnly) command = CLI_COMMANDS.DISCOVER_ONLY;
    if (options.clearCache) command = CLI_COMMANDS.CLEAR_CACHE;
    if (options.cacheInfo) command = CLI_COMMANDS.CACHE_INFO;

    return { command, verbose: !!options.verbose };
}

/**
 * Check if a command is valid
 */
export function isValidCommand(command: string): command is Command {
    return Object.values(CLI_COMMANDS).includes(command as Command);
}

/**
 * Show help information
 */
export function showHelp(): void {
    console.log(`
Usage: diamond-reader [options]

Options:
  -v, --verbose          Enable verbose output for detailed logging
  --discover-only        Discover all functions without executing them
  --clear-cache          Clear all cached data (functions, results, metadata)
  --cache-info           Display the current status of the cache
  --help                 Show this help message

Default behavior (no options):
  Discovers and calls all safe functions, using cache for speed.
`);
}

/**
 * Show connection information
 */
export function showConnectionInfo(blockNumber: number, chainId: number): void {
    console.log(`✅ Connected to Ethereum mainnet (block: ${blockNumber})`);
    console.log(`📍 Chain ID: ${chainId}`);
}

/**
 * Show loading message
 */
export function showLoading(message: string): void {
    console.log(`🔄 ${message}`);
}

/**
 * Show section header
 */
export function showSectionHeader(title: string): void {
    console.log(`\n📋 ${title}`);
    console.log('─'.repeat(title.length + 3));
}

/**
 * Show success message
 */
export function showSuccess(message: string): void {
    console.log(`✅ ${message}`);
}

/**
 * Show error message
 */
export function showError(message: string): void {
    console.error(`❌ ${message}`);
}

/**
 * Format a single parameter for display
 */
export function formatParameterForDisplay(param: any): string {
    if (typeof param === 'bigint') {
        return param.toString();
    }
    if (typeof param === 'string' && isAddress(param)) {
        return param;
    }
    return JSON.stringify(param);
}
