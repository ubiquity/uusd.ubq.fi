import { formatUnits } from "viem";
import type { TokenBalance as _TokenBalance } from "../types/inventory.types.ts";
import type { InventoryBarComponent } from "../components/inventory-bar-component.ts";
import { MAX_BUTTON_GAS_RESERVE } from "../constants/numeric-constants.ts";

/**
 * Balance utilities for auto-population of input fields
 */

/**
 * Get the maximum available balance for a specific token from inventory bar
 */
export function getMaxTokenBalance(inventoryBar: InventoryBarComponent, tokenSymbol: string): string {
  if (!inventoryBar) {
    return "0";
  }

  const balances = inventoryBar.getBalances();
  const tokenBalance = balances.find((balance) => balance.symbol === tokenSymbol);

  if (!tokenBalance) {
    return "0";
  }

  // Convert to human-readable format for input field
  const formattedBalance = formatUnits(tokenBalance.balance, tokenBalance.decimals);

  // Remove trailing zeros and ensure clean formatting
  const cleanBalance = formattedBalance.replace(/\.?0+$/, "");

  return cleanBalance;
}

/**
 * Check if a token balance is available and greater than zero
 */
export function hasAvailableBalance(inventoryBar: InventoryBarComponent, tokenSymbol: string): boolean {
  const balances = inventoryBar.getBalances();
  const tokenBalance = balances.find((balance) => balance.symbol === tokenSymbol);

  if (!tokenBalance) {
    return false;
  }

  return tokenBalance.balance > 0n;
}

/**
 * Get formatted balance display for a specific token
 */
export function getBalanceDisplay(inventoryBar: InventoryBarComponent, tokenSymbol: string): string {
  const balances = inventoryBar.getBalances();
  const tokenBalance = balances.find((balance) => balance.symbol === tokenSymbol);

  if (!tokenBalance) {
    return "0";
  }

  const formattedBalance = formatUnits(tokenBalance.balance, tokenBalance.decimals);
  const trimmed = formattedBalance.replace(/\.?0+$/, "") || "0";

  if (trimmed === "0") return "0";
  if (tokenBalance.balance < 100000000000000n) return "<0.0001";

  return parseFloat(formattedBalance).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}

/**
 * Get the max spendable amount for the "Max" button.
 * For ETH/native tokens, reserves gas amount. For ERC-20, returns full balance.
 */
export function getMaxSpendableBalance(inventoryBar: InventoryBarComponent, tokenSymbol: string, isNativeToken: boolean = false): string {
  const maxBalance = getMaxTokenBalance(inventoryBar, tokenSymbol);
  if (maxBalance === "0") return "0";

  if (isNativeToken) {
    const balances = inventoryBar.getBalances();
    const tokenBalance = balances.find((balance) => balance.symbol === tokenSymbol);
    if (!tokenBalance || tokenBalance.balance <= MAX_BUTTON_GAS_RESERVE) return "0";
    const spendable = tokenBalance.balance - MAX_BUTTON_GAS_RESERVE;
    const formatted = formatUnits(spendable, tokenBalance.decimals);
    return formatted.replace(/\.?0+$/, "") || "0";
  }

  return maxBalance;
}
