import { describe, expect, test } from "bun:test";
import type { InventoryBarComponent } from "../components/inventory-bar-component.ts";
import type { TokenBalance } from "../types/inventory.types.ts";
import { getBalanceDisplay } from "./balance-utils.ts";
import { getMinimumVisibleTokenAmount, isBalanceZero, MINIMUM_VISIBLE_TOKEN_AMOUNT } from "./token-utils.ts";

function createInventoryBar(balances: TokenBalance[]): InventoryBarComponent {
  return { getBalances: () => balances } as unknown as InventoryBarComponent;
}

const USDC_1 = 1_000_000n; // 1 USDC at 6 decimals
const USDC_DUST = 99n; // 0.000099 USDC at 6 decimals
const WBTC_HALF = 50_000_000n; // 0.5 WBTC at 8 decimals
const WBTC_DUST = 9_999n; // 0.00009999 WBTC at 8 decimals
const LUSD_MINIMUM = 100_000_000_000_000n; // 0.0001 LUSD at 18 decimals
const LUSD_DUST = 99_999_999_999_999n; // 0.000099999999999999 LUSD at 18 decimals

describe("getMinimumVisibleTokenAmount", () => {
  test("scales the 0.0001 human threshold to the token decimals", () => {
    expect(MINIMUM_VISIBLE_TOKEN_AMOUNT).toBe("0.0001");
    expect(getMinimumVisibleTokenAmount(6)).toBe(100n);
    expect(getMinimumVisibleTokenAmount(8)).toBe(10_000n);
    expect(getMinimumVisibleTokenAmount(18)).toBe(100_000_000_000_000n);
  });

  test("falls back to the smallest raw unit below 4 decimals instead of rounding to zero", () => {
    expect(getMinimumVisibleTokenAmount(2)).toBe(1n);
    expect(getMinimumVisibleTokenAmount(0)).toBe(1n);
    expect(isBalanceZero(0n, 2)).toBe(true);
    expect(isBalanceZero(1n, 2)).toBe(false);
  });
});

describe("isBalanceZero", () => {
  test("compares against the decimals-scaled minimum", () => {
    expect(isBalanceZero(USDC_DUST, 6)).toBe(true);
    expect(isBalanceZero(100n, 6)).toBe(false);
    expect(isBalanceZero(WBTC_DUST, 8)).toBe(true);
    expect(isBalanceZero(10_000n, 8)).toBe(false);
    expect(isBalanceZero(LUSD_DUST, 18)).toBe(true);
    expect(isBalanceZero(LUSD_MINIMUM, 18)).toBe(false);
  });

  test("filters a mixed-decimals balance list like the inventory bar does", () => {
    const balances: TokenBalance[] = [
      { symbol: "USDC", address: "0x0000000000000000000000000000000000000001", balance: USDC_1, decimals: 6 },
      { symbol: "WBTC", address: "0x0000000000000000000000000000000000000002", balance: WBTC_DUST, decimals: 8 },
      { symbol: "LUSD", address: "0x0000000000000000000000000000000000000003", balance: LUSD_MINIMUM, decimals: 18 },
    ];

    const visible = balances.filter((balance) => !isBalanceZero(balance.balance, balance.decimals));

    expect(visible.map((balance) => balance.symbol)).toEqual(["USDC", "LUSD"]);
  });
});

describe("getBalanceDisplay", () => {
  test("keeps 6/8/18-decimal balances visible above the scaled minimum", () => {
    const inventoryBar = createInventoryBar([
      { symbol: "USDC", address: "0x0000000000000000000000000000000000000001", balance: USDC_1, decimals: 6 },
      { symbol: "WBTC", address: "0x0000000000000000000000000000000000000002", balance: WBTC_HALF, decimals: 8 },
      { symbol: "LUSD", address: "0x0000000000000000000000000000000000000003", balance: LUSD_MINIMUM, decimals: 18 },
    ]);

    expect(getBalanceDisplay(inventoryBar, "USDC")).toBe("1");
    expect(getBalanceDisplay(inventoryBar, "WBTC")).toBe("0.5");
    expect(getBalanceDisplay(inventoryBar, "LUSD")).toBe("0.0001");
  });

  test("still hides balances below the scaled minimum", () => {
    const inventoryBar = createInventoryBar([
      { symbol: "USDC", address: "0x0000000000000000000000000000000000000001", balance: USDC_DUST, decimals: 6 },
      { symbol: "WBTC", address: "0x0000000000000000000000000000000000000002", balance: WBTC_DUST, decimals: 8 },
      { symbol: "LUSD", address: "0x0000000000000000000000000000000000000003", balance: LUSD_DUST, decimals: 18 },
    ]);

    expect(getBalanceDisplay(inventoryBar, "USDC")).toBe("<0.0001");
    expect(getBalanceDisplay(inventoryBar, "WBTC")).toBe("<0.0001");
    expect(getBalanceDisplay(inventoryBar, "LUSD")).toBe("<0.0001");
  });
});
