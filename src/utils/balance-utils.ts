import { formatUnits } from 'viem';
import type { TokenBalance } from '../types/inventory.types.ts';
import type { InventoryBarComponent } from '../components/inventory-bar-component.ts';

/**
 * Balance utilities for auto-population of input fields
 */

/**
 * Get the maximum available balance for a specific token from inventory bar
 */
export function getMaxTokenBalance(
    inventoryBar: InventoryBarComponent,
    tokenSymbol: string
): string {
    if (!inventoryBar) {
        return '0';
    }

    const balances = inventoryBar.getBalances();
    const tokenBalance = balances.find(balance => balance.symbol === tokenSymbol);

    if (!tokenBalance) {
        return '0';
    }

    // Convert to human-readable format for input field
    const formattedBalance = formatUnits(tokenBalance.balance, tokenBalance.decimals);

    // Remove trailing zeros and ensure clean formatting
    const cleanBalance = parseFloat(formattedBalance).toString();

    return cleanBalance;
}

/**
 * Check if a token balance is available and greater than zero
 */
export function hasAvailableBalance(
    inventoryBar: InventoryBarComponent,
    tokenSymbol: string
): boolean {
    const balances = inventoryBar.getBalances();
    const tokenBalance = balances.find(balance => balance.symbol === tokenSymbol);

    if (!tokenBalance) {
        return false;
    }

    return tokenBalance.balance > 0n;
}

/**
 * Get formatted balance display for a specific token
 */
export function getBalanceDisplay(
    inventoryBar: InventoryBarComponent,
    tokenSymbol: string
): string {
    const balances = inventoryBar.getBalances();
    const tokenBalance = balances.find(balance => balance.symbol === tokenSymbol);

    if (!tokenBalance) {
        return '0';
    }

    const formattedBalance = formatUnits(tokenBalance.balance, tokenBalance.decimals);
    const num = parseFloat(formattedBalance);

    if (num === 0) return '0';
    if (num < 0.0001) return '<0.0001';

    return num.toLocaleString('en-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4
    });
}