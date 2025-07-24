import { createPublicClient, http, type Address } from 'viem';
import { mainnet } from 'viem/chains';

// Environment-aware RPC URL configuration
export const getRpcUrl = (): string => {
  // Default to cloud-hosted endpoint for local development convenience
  const defaultRpcUrl = 'https://rpc.ubq.fi/1';

  // In browser environment
  if (typeof window !== 'undefined' && window.location) {
    // Only use relative endpoint when on ubq.fi domain (prevents CORS prefetch lag)
    if (window.location.hostname.includes('ubq.fi') &&
        !window.location.hostname.includes('localhost')) {
      return '/rpc/1';
    }
    // For all other browser cases (localhost, dev servers, etc.), use cloud endpoint
    return defaultRpcUrl;
  }

  // In Node/Bun environment (CLI), use cloud endpoint
  if (typeof process !== 'undefined') {
    return defaultRpcUrl;
  }

  // Fallback to cloud endpoint for any other cases
  return defaultRpcUrl;
};

// Network and contract configuration
export const RPC_URL = getRpcUrl();
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
