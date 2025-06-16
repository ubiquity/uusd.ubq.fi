import type { Address } from 'viem';
import type { ContractAddresses } from '../types/contracts.ts';

// Contract addresses
export const ADDRESSES: ContractAddresses = {
    DIAMOND: '0xED3084c98148e2528DaDCB53C56352e549C488fA' as Address,
    DOLLAR: '0xb6919ef2ee4fc163bc954c5678e2bb570c2d103' as Address,
    GOVERNANCE: '0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0' as Address,
    PERMIT2: '0x000000000022D473030F116dDEE9F6B43aC78BA3' as Address
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

// Minimal ABIs - only functions we need
export const DIAMOND_ABI = [
    {
        name: 'mintDollar',
        type: 'function',
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
    }
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
