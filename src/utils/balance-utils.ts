import { formatUnits, type Address } from "viem";
import type { TokenBalance } from "../types/inventory.types.ts";
import type { InventoryBarComponent } from "../components/inventory-bar-component.ts";
import { areAddressesEqual } from "./format-utils.ts";

/**
 * Minimum USD value for a balance to be displayed in inventory-facing UI
 */
export const MIN_DISPLAY_USD_VALUE = 1;

/**
 * Balance utilities for inventory display and amount input fields
 */

/**
 * Format a raw balance into a human-readable string without trailing zeros
 */
function formatBalanceForInput(tokenBalance: TokenBalance): string {
  const formattedBalance = formatUnits(tokenBalance.balance, tokenBalance.decimals);
  if (!formattedBalance.includes(".")) {
    return formattedBalance;
  }

  return formattedBalance.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "") || "0";
}

function findBalanceByAddress(balances: TokenBalance[], tokenAddress: Address): TokenBalance | undefined {
  return balances.find((balance) => areAddressesEqual(balance.address, tokenAddress));
}

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

  return formatBalanceForInput(tokenBalance);
}

/**
 * Get the maximum available balance for a specific token address from inventory bar
 */
export function getMaxTokenBalanceByAddress(inventoryBar: InventoryBarComponent, tokenAddress: Address): string {
  if (!inventoryBar) {
    return "0";
  }

  const tokenBalance = findBalanceByAddress(inventoryBar.getBalances(), tokenAddress);

  if (!tokenBalance) {
    return "0";
  }

  return formatBalanceForInput(tokenBalance);
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
 * Check if a token balance is available and greater than zero for a specific token address
 */
export function hasAvailableBalanceByAddress(inventoryBar: InventoryBarComponent, tokenAddress: Address): boolean {
  const tokenBalance = findBalanceByAddress(inventoryBar.getBalances(), tokenAddress);

  if (!tokenBalance) {
    return false;
  }

  return tokenBalance.balance > 0n;
}

/**
 * Filter balances to the minimum USD value shown in inventory-facing UI
 */
export function getDisplayableBalances(balances: TokenBalance[]): TokenBalance[] {
  return balances.filter((balance) => balance.balance > 0n && (balance.usdValue ?? 0) > MIN_DISPLAY_USD_VALUE);
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
