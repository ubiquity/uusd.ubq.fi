import { describe, expect, test } from "bun:test";
import { hasDisplayableUsdValue, MINIMUM_DISPLAY_USD_VALUE } from "./balance-utils.ts";
import type { TokenBalance } from "../types/inventory.types.ts";

const baseBalance: TokenBalance = {
  symbol: "LUSD",
  address: "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0",
  balance: 1n,
  decimals: 18,
};

describe("hasDisplayableUsdValue", () => {
  test("hides balances worth one dollar or less", () => {
    expect(hasDisplayableUsdValue({ ...baseBalance, usdValue: MINIMUM_DISPLAY_USD_VALUE })).toBe(false);
    expect(hasDisplayableUsdValue({ ...baseBalance, usdValue: 0.99 })).toBe(false);
    expect(hasDisplayableUsdValue(baseBalance)).toBe(false);
  });

  test("keeps balances worth more than one dollar", () => {
    expect(hasDisplayableUsdValue({ ...baseBalance, usdValue: 1.01 })).toBe(true);
  });
});
