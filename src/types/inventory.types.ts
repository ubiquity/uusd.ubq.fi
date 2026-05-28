import type { Address } from "viem";

/**
 * Token balance information
 */
export interface TokenBalance {
  symbol: string;
  address: Address;
  balance: bigint;
  decimals: number;
  usdValue?: number;
}

/**
 * Inventory bar component state
 */
export interface InventoryBarState {
  isConnected: boolean;
  isLoading: boolean;
  balances: TokenBalance[];
  totalUsdValue: number;
  currentAccount: Address | null; // Track which account the current balances belong to
}

/**
 * Token metadata interface
 */
export interface TokenMetadata {
  symbol: string;
  address: Address;
  decimals: number;
  displayName?: string;
}

/**
 * Supported tokens for inventory display
 */
export const INVENTORY_TOKENS = {
  LUSD: {
    symbol: "LUSD",
    address: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0" as Address,
    decimals: 18,
    displayName: "LUSD",
  },
  UUSD: {
    symbol: "UUSD",
    address: "0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103" as Address,
    decimals: 18,
    displayName: "UUSD",
  },
  UBQ: {
    symbol: "UBQ",
    address: "0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0" as Address,
    decimals: 18,
    displayName: "UBQ",
  },
} as const;

/**
 * Minimum USD value to display an asset in the inventory bar.
 * Assets worth less than this threshold are hidden to reduce clutter.
 */
export const MIN_DISPLAY_VALUE_USD = 1.0;

/**
 * Filter token balances to only show those above the minimum display threshold.
 * Preserves core tokens (LUSD, UUSD, UBQ) regardless of balance.
 */
export function filterDisplayableBalances(balances: TokenBalance[]): TokenBalance[] {
  const coreSymbols = new Set(Object.values(INVENTORY_TOKENS).map((t) => t.symbol));
  return balances.filter((b) => {
    // Always show core tokens
    if (coreSymbols.has(b.symbol)) return true;
    // Show non-core tokens only if USD value >= threshold
    return (b.usdValue ?? 0) >= MIN_DISPLAY_VALUE_USD;
  });
}
