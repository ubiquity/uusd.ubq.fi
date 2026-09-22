import { describe, expect, test } from "bun:test";
import type { Address } from "viem";
import type { InventoryBarComponent } from "../components/inventory-bar-component.ts";
import type { TokenBalance } from "../types/inventory.types.ts";
import {
  formatBalanceForInput,
  getDisplayableBalances,
  getMaxTokenBalance,
  getMaxTokenBalanceByAddress,
  getSelectableWalletBalances,
  hasAvailableBalanceByAddress,
  hasDisplayableUsdValue,
  MINIMUM_DISPLAY_USD_VALUE,
  trimFormattedBalance,
} from "./balance-utils.ts";

function createInventoryBar(balances: TokenBalance[]): InventoryBarComponent {
  return { getBalances: () => balances } as unknown as InventoryBarComponent;
}

const USDC: Address = "0x00000000000000000000000000000000000000A1";
const USDC_LOWER: Address = "0x00000000000000000000000000000000000000a1";
const DAI: Address = "0x00000000000000000000000000000000000000b2";
const LUSD: Address = "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0";
const UUSD: Address = "0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103";

const USDC_1000 = 1_000_000_000n; // 1000 USDC at 6 decimals
const USDC_10 = 10_000_000n; // 10 USDC at 6 decimals
const USDC_2500 = 2_500_000_000n; // 2500 USDC at 6 decimals
const USDC_1_5 = 1_500_000n; // 1.5 USDC at 6 decimals

describe("trimFormattedBalance (D1)", () => {
  test("preserves whole-number formatUnits output", () => {
    expect(trimFormattedBalance("1000")).toBe("1000");
    expect(trimFormattedBalance("10")).toBe("10");
    expect(trimFormattedBalance("2500")).toBe("2500");
  });

  test("trims trailing zeros only inside the fractional part", () => {
    expect(trimFormattedBalance("1.500000")).toBe("1.5");
    expect(trimFormattedBalance("1.000000")).toBe("1");
    expect(trimFormattedBalance("0.0001")).toBe("0.0001");
    expect(trimFormattedBalance("0")).toBe("0");
    expect(trimFormattedBalance("0.0")).toBe("0");
  });
});

describe("formatBalanceForInput", () => {
  test("keeps whole-number balances intact", () => {
    expect(formatBalanceForInput({ symbol: "USDC", address: USDC, balance: USDC_1000, decimals: 6 })).toBe("1000");
    expect(formatBalanceForInput({ symbol: "USDC", address: USDC, balance: USDC_10, decimals: 6 })).toBe("10");
    expect(formatBalanceForInput({ symbol: "USDC", address: USDC, balance: USDC_2500, decimals: 6 })).toBe("2500");
  });

  test("formats fractional and zero balances without corrupting them", () => {
    expect(formatBalanceForInput({ symbol: "USDC", address: USDC, balance: USDC_1_5, decimals: 6 })).toBe("1.5");
    expect(formatBalanceForInput({ symbol: "LUSD", address: LUSD, balance: 0n, decimals: 18 })).toBe("0");
    expect(formatBalanceForInput({ symbol: "LUSD", address: LUSD, balance: 100_000_000_000_000n, decimals: 18 })).toBe("0.0001");
  });
});

describe("getMaxTokenBalance", () => {
  test("returns the whole-number max instead of a truncated value", () => {
    const inventoryBar = createInventoryBar([{ symbol: "USDC", address: USDC, balance: USDC_1000, decimals: 6 }]);

    expect(getMaxTokenBalance(inventoryBar, "USDC")).toBe("1000");
  });

  test("returns zero for a missing token", () => {
    const inventoryBar = createInventoryBar([{ symbol: "USDC", address: USDC, balance: USDC_1000, decimals: 6 }]);

    expect(getMaxTokenBalance(inventoryBar, "UUSD")).toBe("0");
  });
});

describe("getMaxTokenBalanceByAddress", () => {
  const balances: TokenBalance[] = [
    { symbol: "USDC", address: USDC, balance: USDC_1000, decimals: 6 },
    { symbol: "USDC", address: DAI, balance: USDC_10, decimals: 6 },
  ];

  test("matches the token address case-insensitively", () => {
    const inventoryBar = createInventoryBar(balances);

    expect(getMaxTokenBalanceByAddress(inventoryBar, USDC_LOWER)).toBe("1000");
  });

  test("disambiguates duplicate symbols by address", () => {
    const inventoryBar = createInventoryBar(balances);

    expect(getMaxTokenBalance(inventoryBar, "USDC")).toBe("1000");
    expect(getMaxTokenBalanceByAddress(inventoryBar, DAI)).toBe("10");
  });

  test("returns zero for an address that is not held", () => {
    const inventoryBar = createInventoryBar(balances);

    expect(getMaxTokenBalanceByAddress(inventoryBar, UUSD)).toBe("0");
  });
});

describe("hasAvailableBalanceByAddress", () => {
  test("is true only for a positive, case-insensitively matching holding", () => {
    const inventoryBar = createInventoryBar([
      { symbol: "USDC", address: USDC, balance: USDC_1000, decimals: 6 },
      { symbol: "UUSD", address: UUSD, balance: 0n, decimals: 18 },
    ]);

    expect(hasAvailableBalanceByAddress(inventoryBar, USDC_LOWER)).toBe(true);
    expect(hasAvailableBalanceByAddress(inventoryBar, UUSD)).toBe(false);
    expect(hasAvailableBalanceByAddress(inventoryBar, LUSD)).toBe(false);
  });
});

describe("hasDisplayableUsdValue", () => {
  test("requires a positive balance priced strictly above $1.00", () => {
    expect(MINIMUM_DISPLAY_USD_VALUE).toBe(1);
    expect(hasDisplayableUsdValue({ symbol: "USDC", address: USDC, balance: USDC_1000, decimals: 6, usdValue: 1000 })).toBe(true);
    expect(hasDisplayableUsdValue({ symbol: "USDC", address: USDC, balance: USDC_1000, decimals: 6, usdValue: 1.01 })).toBe(true);
    expect(hasDisplayableUsdValue({ symbol: "USDC", address: USDC, balance: USDC_1000, decimals: 6, usdValue: 1 })).toBe(false);
    expect(hasDisplayableUsdValue({ symbol: "USDC", address: USDC, balance: USDC_1000, decimals: 6, usdValue: 0.99 })).toBe(false);
    expect(hasDisplayableUsdValue({ symbol: "USDC", address: USDC, balance: USDC_1000, decimals: 6 })).toBe(false);
    expect(hasDisplayableUsdValue({ symbol: "USDC", address: USDC, balance: 0n, decimals: 6, usdValue: 5 })).toBe(false);
  });
});

describe("getDisplayableBalances", () => {
  test("keeps only priced holdings above $1.00 for the inventory bar", () => {
    const balances: TokenBalance[] = [
      { symbol: "LUSD", address: LUSD, balance: USDC_10, decimals: 6, usdValue: 12.5 },
      { symbol: "USDC", address: USDC, balance: 0n, decimals: 6, usdValue: 0 },
      { symbol: "DAI", address: DAI, balance: USDC_10, decimals: 6, usdValue: 0.5 },
      { symbol: "UUSD", address: UUSD, balance: USDC_1000, decimals: 6, usdValue: 1000 },
    ];

    expect(getDisplayableBalances(balances).map((balance) => balance.symbol)).toEqual(["LUSD", "UUSD"]);
  });
});

describe("getSelectableWalletBalances", () => {
  test("hides known priced dust but preserves unpriced holdings", () => {
    const balances: TokenBalance[] = [
      { symbol: "LUSD", address: LUSD, balance: USDC_10, decimals: 6, usdValue: 12.5 },
      { symbol: "DAI", address: DAI, balance: USDC_10, decimals: 6, usdValue: 0.75 },
      { symbol: "USDC", address: USDC, balance: USDC_10, decimals: 6, usdValue: 1 },
      { symbol: "UUSD", address: UUSD, balance: USDC_1000, decimals: 6 },
      { symbol: "UBQ", address: "0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0", balance: USDC_10, decimals: 18, usdValue: 0 },
      { symbol: "ZERO", address: "0x00000000000000000000000000000000000000c3", balance: 0n, decimals: 18 },
    ];

    expect(getSelectableWalletBalances(balances).map((balance) => balance.symbol)).toEqual(["LUSD", "UUSD", "UBQ"]);
  });
});
