import type { Address } from 'viem';
import type { ContractAddresses } from '../types/contracts.ts';

// Contract addresses
export const ADDRESSES: ContractAddresses = {
    DIAMOND: '0xED3084c98148e2528DaDCB53C56352e549C488fA' as Address,
    DOLLAR: '0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103' as Address,
    GOVERNANCE: '0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0' as Address,
};

// Hardcoded LUSD collateral configuration
export const LUSD_COLLATERAL = {
    index: 0,
    name: "LUSD",
    address: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0" as Address,
    mintingFee: 0,
    redemptionFee: 0,
    missingDecimals: 0
} as const;

// Price threshold configuration - these are read dynamically from contract storage
// No hardcoded values - the actual values are fetched at runtime from the deployed contract
export const PRICE_THRESHOLD_CONFIG = {
    // Storage position for UbiquityPoolStorage, calculated from:
    // bytes32(uint256(keccak256("ubiquity.contracts.ubiquity.pool.storage")) - 1) & ~bytes32(uint256(0xff));
    // The previous value was based on a miscalculation of the keccak256 hash. This is the correct value.
    UBIQUITY_POOL_STORAGE_BASE: BigInt("0x2a1c4d9e43cc908458204ba8dd637dd73ede6adc739c3209ac617ae953246c00"),
    // Expected value ranges for validation
    MIN_VALID_THRESHOLD: 500000n, // $0.50
    MAX_VALID_THRESHOLD: 1500000n, // $1.50
    // Cache duration in milliseconds
    CACHE_DURATION: 60000, // 1 minute
} as const;

// Minimal ABIs - only functions we need
export const DIAMOND_ABI = [
    {
        name: 'mintDollar',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'collateralIndex', type: 'uint256' },
            { name: 'dollarAmount', type: 'uint256' },
            { name: 'dollarOutMin', type: 'uint256' },
            { name: 'maxCollateralIn', type: 'uint256' },
            { name: 'maxGovernanceIn', type: 'uint256' },
            { name: 'isOneToOne', type: 'bool' }
        ],
        outputs: [
            { name: 'totalDollarMint', type: 'uint256' },
            { name: 'collateralNeeded', type: 'uint256' },
            { name: 'governanceNeeded', type: 'uint256' }
        ]
    },
    {
        name: 'redeemDollar',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [
            { name: 'collateralIndex', type: 'uint256' },
            { name: 'dollarAmount', type: 'uint256' },
            { name: 'governanceOutMin', type: 'uint256' },
            { name: 'collateralOutMin', type: 'uint256' }
        ],
        outputs: [
            { name: 'collateralOut', type: 'uint256' },
            { name: 'governanceOut', type: 'uint256' }
        ]
    },
    {
        name: 'collectRedemption',
        type: 'function',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'collateralIndex', type: 'uint256' }],
        outputs: [
            { name: 'governanceAmount', type: 'uint256' },
            { name: 'collateralAmount', type: 'uint256' }
        ]
    },
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
    {
        name: 'getDollarPriceUsd',
        type: 'function',
        stateMutability: 'view',
        inputs: [],
        outputs: [{ type: 'uint256' }]
    },
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
] as const;

export const ERC20_ABI = [
    {
        name: 'balanceOf',
        type: 'function',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }]
    },
    {
        name: 'allowance',
        type: 'function',
        stateMutability: 'view',
        inputs: [
            { name: 'owner', type: 'address' },
            { name: 'spender', type: 'address' }
        ],
        outputs: [{ type: 'uint256' }]
    },
    {
        name: 'approve',
        type: 'function',
        inputs: [
            { name: 'spender', type: 'address' },
            { name: 'amount', type: 'uint256' }
        ],
        outputs: [{ type: 'bool' }]
    }
] as const;
