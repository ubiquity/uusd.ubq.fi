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
export const INVENTORY_TOKENS: Record<string, TokenMetadata> = {
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
