/**
 * Configuration for Diamond Reader CLI
 */

import type { Address } from 'viem';
import { mainnet } from 'viem/chains';

/**
 * Network and RPC configuration
 */
export const RPC_CONFIG = {
    endpoint: 'https://rpc.ankr.com/eth',
    chain: mainnet
} as const;

/**
 * Contract addresses
 */
export const CONTRACT_ADDRESSES = {
    DIAMOND: '0xED3084c98148e2528DaDCB53C56352e549C488fA' as Address,
    DOLLAR: '0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103' as Address,
    GOVERNANCE: '0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0' as Address
} as const;

/**
 * Comprehensive Diamond ABI for reading all contract settings
 * Includes all functions needed for complete contract analysis
 */
export const DIAMOND_READ_ABI = [
    // Collateral information
    {
        name: 'allCollaterals',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address[]' }]
    },
    {
        name: 'collateralInformation',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'collateralAddress', type: 'address' }],
        outputs: [{
            type: 'tuple',
            components: [
                { name: 'index', type: 'uint256' },
                { name: 'symbol', type: 'string' },
                { name: 'collateralAddress', type: 'address' },
                { name: 'collateralPriceFeedAddress', type: 'address' },
                { name: 'collateralPriceFeedStalenessThreshold', type: 'uint256' },
                { name: 'isEnabled', type: 'bool' },
                { name: 'missingDecimals', type: 'uint256' },
                { name: 'price', type: 'uint256' },
                { name: 'poolCeiling', type: 'uint256' },
                { name: 'isMintPaused', type: 'bool' },
                { name: 'isRedeemPaused', type: 'bool' },
                { name: 'isBorrowPaused', type: 'bool' },
                { name: 'mintingFee', type: 'uint256' },
                { name: 'redemptionFee', type: 'uint256' }
            ]
        }]
    },
    // System ratios and prices
    {
        name: 'collateralRatio',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint256' }]
    },
    {
        name: 'getGovernancePriceUsd',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint256' }]
    },
    // Helper functions for calculations
    {
        name: 'getDollarInCollateral',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'collateralIndex', type: 'uint256' },
            { name: 'dollarAmount', type: 'uint256' }
        ],
        outputs: [{ type: 'uint256' }]
    },
    {
        name: 'getRedeemCollateralBalance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'userAddress', type: 'address' },
            { name: 'collateralIndex', type: 'uint256' }
        ],
        outputs: [{ type: 'uint256' }]
    },
    // Additional system information functions
    {
        name: 'mintingCalculatorAddress',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address' }]
    },
    {
        name: 'redemptionCalculatorAddress',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address' }]
    },
    {
        name: 'targetPrice',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint256' }]
    },
    {
        name: 'totalDollarSupply',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint256' }]
    },
    {
        name: 'dollarToken',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address' }]
    },
    {
        name: 'governanceToken',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'address' }]
    }
] as const;

/**
 * CLI command configuration
 */
export const CLI_COMMANDS = {
    HELP: 'help',
    ALL: '--all',
    COLLATERAL_INFO: '--collateral-info',
    RATIOS: '--ratios',
    PRICES: '--prices',
    SYSTEM_STATUS: '--system-status'
} as const;

/**
 * Display formatting constants
 */
export const DISPLAY_CONFIG = {
    DECIMALS: {
        PRICE: 6,
        RATIO: 6,
        PERCENTAGE: 2
    },
    SYMBOLS: {
        USD: '$',
        PERCENTAGE: '%',
        SUCCESS: '✅',
        ERROR: '❌',
        INFO: '📍',
        LOADING: '🔄',
        DATA: '📊'
    }
} as const;