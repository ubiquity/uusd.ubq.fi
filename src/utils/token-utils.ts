import { formatUnits, type Address } from 'viem';
import type { TokenBalance, TokenMetadata } from '../types/inventory.types.ts';

/**
 * Format token amount for display with appropriate decimal places
 */
export function formatTokenAmount(amount: bigint, decimals: number, displayDecimals: number = 4): string {
    const formatted = formatUnits(amount, decimals);
    const num = parseFloat(formatted);

    if (num === 0) return '0';
    if (num < 0.0001) return '<0.0001';

    return num.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: displayDecimals
    });
}

/**
 * Format USD value for display
 */
export function formatUsdValue(value: number): string {
    if (value === 0) return '$0.00';
    if (value < 0.01) return '<$0.01';

    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

/**
 * Get token symbol with fallback to address
 */
export function getTokenSymbol(token: TokenMetadata): string {
    return token.displayName || token.symbol;
}

/**
 * Calculate total USD value from token balances
 */
export function calculateTotalUsdValue(balances: TokenBalance[]): number {
    return balances.reduce((total, balance) => {
        return total + (balance.usdValue || 0);
    }, 0);
}

/**
 * Check if token balance is effectively zero (less than 0.0001)
 */
export function isBalanceZero(balance: bigint, decimals: number): boolean {
    const formatted = formatUnits(balance, decimals);
    return parseFloat(formatted) < 0.0001;
}

/**
 * Sort token balances by USD value (highest first)
 */
export function sortBalancesByValue(balances: TokenBalance[]): TokenBalance[] {
    return [...balances].sort((a, b) => {
        const aValue = a.usdValue || 0;
        const bValue = b.usdValue || 0;
        return bValue - aValue;
    });
}

/**
 * Create display text for token balance
 */
export function createBalanceDisplayText(balance: TokenBalance): string {
    const amount = formatTokenAmount(balance.balance, balance.decimals);
    const usdValue = balance.usdValue ? ` (${formatUsdValue(balance.usdValue)})` : '';
    return `${amount} ${balance.symbol}${usdValue}`;
}