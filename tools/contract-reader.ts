/**
 * Contract reading utilities for Diamond Reader CLI
 */

import { createPublicClient, http, formatUnits, type PublicClient, type Address } from 'viem';
import { RPC_CONFIG, CONTRACT_ADDRESSES, DIAMOND_READ_ABI, DISPLAY_CONFIG } from './config.ts';

/**
 * Create a configured public client for reading contract data
 */
export function createContractReader(): PublicClient {
    return createPublicClient({
        chain: RPC_CONFIG.chain,
        transport: http(RPC_CONFIG.endpoint)
    });
}

/**
 * Test RPC connection and get network info
 */
export async function testConnection(client: PublicClient): Promise<{ blockNumber: bigint; chainId: number }> {
    const [blockNumber, chainId] = await Promise.all([
        client.getBlockNumber(),
        client.getChainId()
    ]);

    return { blockNumber, chainId };
}

/**
 * Read collateral ratio from diamond contract
 */
export async function readCollateralRatio(client: PublicClient): Promise<bigint> {
    return await client.readContract({
        address: CONTRACT_ADDRESSES.DIAMOND,
        abi: DIAMOND_READ_ABI,
        functionName: 'collateralRatio'
    }) as bigint;
}

/**
 * Read governance price from diamond contract
 */
export async function readGovernancePrice(client: PublicClient): Promise<bigint> {
    return await client.readContract({
        address: CONTRACT_ADDRESSES.DIAMOND,
        abi: DIAMOND_READ_ABI,
        functionName: 'getGovernancePriceUsd'
    }) as bigint;
}

/**
 * Read all collateral addresses
 */
export async function readAllCollaterals(client: PublicClient): Promise<Address[]> {
    return await client.readContract({
        address: CONTRACT_ADDRESSES.DIAMOND,
        abi: DIAMOND_READ_ABI,
        functionName: 'allCollaterals'
    }) as Address[];
}

/**
 * Read detailed collateral information
 */
export async function readCollateralInformation(client: PublicClient, collateralAddress: Address): Promise<any> {
    return await client.readContract({
        address: CONTRACT_ADDRESSES.DIAMOND,
        abi: DIAMOND_READ_ABI,
        functionName: 'collateralInformation',
        args: [collateralAddress]
    });
}

/**
 * Read comprehensive contract settings for --all command
 */
export async function readAllSettings(client: PublicClient): Promise<{
    system: any;
    collaterals: any[];
    prices: any;
    ratios: any;
}> {
    try {
        // Get all collateral addresses
        const collateralAddresses = await readAllCollaterals(client);

        // Read system-wide information
        const [collateralRatio, governancePrice, targetPrice, totalSupply, dollarToken, governanceToken] = await Promise.all([
            readCollateralRatio(client),
            readGovernancePrice(client),
            client.readContract({
                address: CONTRACT_ADDRESSES.DIAMOND,
                abi: DIAMOND_READ_ABI,
                functionName: 'targetPrice'
            }),
            client.readContract({
                address: CONTRACT_ADDRESSES.DIAMOND,
                abi: DIAMOND_READ_ABI,
                functionName: 'totalDollarSupply'
            }),
            client.readContract({
                address: CONTRACT_ADDRESSES.DIAMOND,
                abi: DIAMOND_READ_ABI,
                functionName: 'dollarToken'
            }),
            client.readContract({
                address: CONTRACT_ADDRESSES.DIAMOND,
                abi: DIAMOND_READ_ABI,
                functionName: 'governanceToken'
            })
        ]);

        // Read detailed collateral information
        const collaterals = await Promise.all(
            collateralAddresses.map(async (address) => {
                const info = await readCollateralInformation(client, address);
                return { address, ...info };
            })
        );

        return {
            system: {
                dollarToken,
                governanceToken,
                targetPrice,
                totalSupply
            },
            collaterals,
            prices: {
                governancePrice,
                targetPrice
            },
            ratios: {
                collateralRatio
            }
        };
    } catch (error) {
        handleContractError(error, 'reading all settings');
    }
}

/**
 * Read collateral information for --collateral-info command
 */
export async function readCollateralInfo(client: PublicClient): Promise<any[]> {
    try {
        const collateralAddresses = await readAllCollaterals(client);

        const collaterals = await Promise.all(
            collateralAddresses.map(async (address) => {
                const info = await readCollateralInformation(client, address);
                return { address, ...info };
            })
        );

        return collaterals;
    } catch (error) {
        handleContractError(error, 'reading collateral information');
    }
}

/**
 * Read ratios for --ratios command
 */
export async function readRatios(client: PublicClient): Promise<any> {
    try {
        const [collateralRatio, targetPrice] = await Promise.all([
            readCollateralRatio(client),
            client.readContract({
                address: CONTRACT_ADDRESSES.DIAMOND,
                abi: DIAMOND_READ_ABI,
                functionName: 'targetPrice'
            })
        ]);

        return {
            collateralRatio,
            targetPrice
        };
    } catch (error) {
        handleContractError(error, 'reading ratios');
    }
}

/**
 * Read prices for --prices command
 */
export async function readPrices(client: PublicClient): Promise<any> {
    try {
        const [governancePrice, targetPrice, collateralAddresses] = await Promise.all([
            readGovernancePrice(client),
            client.readContract({
                address: CONTRACT_ADDRESSES.DIAMOND,
                abi: DIAMOND_READ_ABI,
                functionName: 'targetPrice'
            }),
            readAllCollaterals(client)
        ]);

        // Get collateral prices
        const collateralPrices = await Promise.all(
            collateralAddresses.map(async (address) => {
                const info = await readCollateralInformation(client, address);
                return {
                    address,
                    symbol: info[1], // symbol is at index 1
                    price: info[7]   // price is at index 7
                };
            })
        );

        return {
            governancePrice,
            targetPrice,
            collateralPrices
        };
    } catch (error) {
        handleContractError(error, 'reading prices');
    }
}

/**
 * Read system status for --system-status command
 */
export async function readSystemStatus(client: PublicClient): Promise<any> {
    try {
        const collateralAddresses = await readAllCollaterals(client);

        // Get status information for each collateral
        const collateralStatuses = await Promise.all(
            collateralAddresses.map(async (address) => {
                const info = await readCollateralInformation(client, address);
                return {
                    address,
                    symbol: info[1],        // symbol
                    isEnabled: info[5],     // isEnabled
                    isMintPaused: info[9],  // isMintPaused
                    isRedeemPaused: info[10], // isRedeemPaused
                    isBorrowPaused: info[11], // isBorrowPaused
                    poolCeiling: info[8]    // poolCeiling
                };
            })
        );

        return {
            collateralStatuses
        };
    } catch (error) {
        handleContractError(error, 'reading system status');
    }
}

/**
 * Format price value for display
 */
export function formatPrice(value: bigint, decimals: number = DISPLAY_CONFIG.DECIMALS.PRICE): string {
    return `${DISPLAY_CONFIG.SYMBOLS.USD}${formatUnits(value, decimals)}`;
}

/**
 * Format ratio value for display (as percentage)
 */
export function formatRatio(value: bigint, decimals: number = DISPLAY_CONFIG.DECIMALS.RATIO): string {
    const formatted = formatUnits(value, decimals);
    const percentage = (parseFloat(formatted) * 100).toFixed(DISPLAY_CONFIG.DECIMALS.PERCENTAGE);
    return `${percentage}${DISPLAY_CONFIG.SYMBOLS.PERCENTAGE}`;
}

/**
 * Format boolean status for display
 */
export function formatStatus(enabled: boolean): string {
    return enabled ?
        `${DISPLAY_CONFIG.SYMBOLS.SUCCESS} Enabled` :
        `${DISPLAY_CONFIG.SYMBOLS.ERROR} Disabled`;
}

/**
 * Format address for display (shortened with checksum)
 */
export function formatAddress(address: Address): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Format amount with proper decimals
 */
export function formatAmount(value: bigint, decimals: number = 18, precision: number = 2): string {
    return Number(formatUnits(value, decimals)).toFixed(precision);
}

/**
 * Error handling with user-friendly messages
 */
export function handleContractError(error: unknown, context: string): never {
    console.error(`${DISPLAY_CONFIG.SYMBOLS.ERROR} Error ${context}:`);

    if (error instanceof Error) {
        // Common Web3 error patterns
        if (error.message.includes('execution reverted')) {
            console.error(`   Contract execution failed - the function may not exist or parameters are invalid`);
        } else if (error.message.includes('network')) {
            console.error(`   Network connection failed - check your internet connection and RPC endpoint`);
        } else if (error.message.includes('timeout')) {
            console.error(`   Request timed out - the network may be slow or overloaded`);
        } else {
            console.error(`   ${error.message}`);
        }
    } else {
        console.error(`   Unknown error occurred`);
    }

    process.exit(1);
}