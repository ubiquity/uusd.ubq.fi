import { createPublicClient, http, type Address } from 'viem';
import { mainnet } from 'viem/chains';

// Network and contract configuration
export const RPC_URL = 'https://rpc.ubq.fi/1';
export const CONTRACT_ADDRESSES = {
    DIAMOND: '0xED3084c98148e2528DaDCB53C56352e549C488fA' as Address,
};

// Viem client for interacting with the Ethereum mainnet
export const viemClient = createPublicClient({
    chain: mainnet,
    transport: http(RPC_URL),
});

// CLI commands enum
export const CLI_COMMANDS = {
    DEFAULT: 'default',
    DISCOVER_ONLY: 'discover-only',
    CLEAR_CACHE: 'clear-cache',
    CACHE_INFO: 'cache-info',
    HELP: 'help',
} as const;

export type Command = typeof CLI_COMMANDS[keyof typeof CLI_COMMANDS];

export const DIAMOND_READ_ABI = [] as const;

export const RPC_CONFIG = {
    url: RPC_URL,
    endpoint: RPC_URL,
    chain: mainnet,
};

export const DISPLAY_CONFIG = {
    showVerbose: false,
    showParameters: true,
    showResults: true,
    SYMBOLS: {
        ERROR: '❌',
        SUCCESS: '✅',
        USD: '$',
        PERCENTAGE: '%',
        LOADING: '🔄',
        INFO: 'ℹ️',
        WARNING: '⚠️'
    },
    DECIMALS: {
        PRICE: 18,
        RATIO: 18,
        PERCENTAGE: 2
    }
};
