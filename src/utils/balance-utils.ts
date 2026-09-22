import { formatUnits, type Address } from "viem";
import type { TokenBalance } from "../types/inventory.types.ts";
import type { InventoryBarComponent } from "../components/inventory-bar-component.ts";
import { areAddressesEqual } from "./format-utils.ts";
import { getMinimumVisibleTokenAmount, MINIMUM_VISIBLE_TOKEN_AMOUNT } from "./token-utils.ts";

/**
 * Balance utilities for inventory display and amount input fields
 */

/**
 * Minimum USD value a priced holding must exceed to be shown by inventory-facing UI.
 * The comparison is strict: a holding worth exactly $1.00 is not "above $1.00".
 */
export const MINIMUM_DISPLAY_USD_VALUE = 1;

/**
 * Trim a `formatUnits` string for an amount input.
 *
 * Whole-number strings ("1000", "10", "2500") are returned unchanged, and trailing zeros are trimmed only inside an
 * existing fractional part ("1.500000" -> "1.5", "1.000000" -> "1", "0.0001" stays "0.0001").
 */
export function trimFormattedBalance(formattedBalance: string): string {
  if (!formattedBalance.includes(".")) {
    return formattedBalance;
  }

  return formattedBalance.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "") || "0";
}

/**
 * Format a balance for the amount input, preserving whole-number balances (D1).
 */
export function formatBalanceForInput(tokenBalance: TokenBalance): string {
  return trimFormattedBalance(formatUnits(tokenBalance.balance, tokenBalance.decimals));
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
 * Get the maximum available balance for a specific token address from inventory bar.
 * Address lookup stays unambiguous when two wallet tokens share a symbol.
 */
export function getMaxTokenBalanceByAddress(inventoryBar: InventoryBarComponent, tokenAddress: Address): string {
  if (!inventoryBar) {
    return "0";
  }

  const balances = inventoryBar.getBalances();
  const tokenBalance = balances.find((balance) => areAddressesEqual(balance.address, tokenAddress));

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
  const balances = inventoryBar.getBalances();
  const tokenBalance = balances.find((balance) => areAddressesEqual(balance.address, tokenAddress));

  if (!tokenBalance) {
    return false;
  }

  return tokenBalance.balance > 0n;
}

/**
 * Check whether a holding has a positive balance priced strictly above the display threshold.
 */
export function hasDisplayableUsdValue(tokenBalance: TokenBalance): boolean {
  return tokenBalance.balance > 0n && (tokenBalance.usdValue ?? 0) > MINIMUM_DISPLAY_USD_VALUE;
}

/**
 * Filter wallet balances down to priced holdings above the display threshold (inventory bar rows).
 */
export function getDisplayableBalances(balances: TokenBalance[]): TokenBalance[] {
  return balances.filter(hasDisplayableUsdValue);
}

/**
 * Whether a wallet holding may be offered in the token selector.
 *
 * Known priced dust is hidden, but a nonzero holding with no known price stays selectable: CoW Swap can still quote
 * it, and hiding it would strand funds (the regression on donor PRs 55/57).
 */
export function isSelectableWalletBalance(tokenBalance: TokenBalance): boolean {
  if (tokenBalance.balance <= 0n) {
    return false;
  }

  if (hasDisplayableUsdValue(tokenBalance)) {
    return true;
  }

  // No known positive price: keep it selectable without inventing a USD value.
  return (tokenBalance.usdValue ?? 0) <= 0;
}

/**
 * Filter wallet balances down to the holdings the token selector may offer.
 */
export function getSelectableWalletBalances(balances: TokenBalance[]): TokenBalance[] {
  return balances.filter(isSelectableWalletBalance);
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
  if (tokenBalance.balance < getMinimumVisibleTokenAmount(tokenBalance.decimals)) return `<${MINIMUM_VISIBLE_TOKEN_AMOUNT}`;

  return parseFloat(formattedBalance).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  });
}
