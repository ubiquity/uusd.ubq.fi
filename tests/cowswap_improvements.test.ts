import { describe, it, expect } from "bun:test";
import { formatTokenAmount, formatUsdValue, isBalanceZero } from "../src/utils/token-utils.ts";
import { areAddressesEqual } from "../src/utils/format-utils.ts";
import type { TokenBalance } from "../src/types/inventory.types.ts";
import { INVENTORY_TOKENS } from "../src/types/inventory.types.ts";

describe("CoWSwap Integration Improvements & Inventory Filtering", () => {
  it("should filter out zero balances and tokens with USD value <= $1.00", () => {
    const balances: TokenBalance[] = [
      {
        symbol: "LUSD",
        address: INVENTORY_TOKENS.LUSD.address,
        balance: 100000000000000000000n, // 100 LUSD
        decimals: 18,
        usdValue: 100.0,
      },
      {
        symbol: "DUST",
        address: "0x1111111111111111111111111111111111111111",
        balance: 100000000000000000n, // 0.1 DUST
        decimals: 18,
        usdValue: 0.1, // under $1.00 -> should be filtered out
      },
      {
        symbol: "EMPTY",
        address: "0x2222222222222222222222222222222222222222",
        balance: 0n,
        decimals: 18,
        usdValue: 0.0,
      },
      {
        symbol: "USDC",
        address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
        balance: 50000000n, // 50 USDC
        decimals: 6,
        usdValue: 50.0, // > $1.00 -> should be kept
      },
    ];

    const displayBalances = balances.filter(
      (b) => !isBalanceZero(b.balance, b.decimals) && (b.usdValue !== undefined && b.usdValue > 1.0)
    );

    expect(displayBalances.length).toBe(2);
    expect(displayBalances.map((b) => b.symbol)).toEqual(["LUSD", "USDC"]);
  });

  it("should correctly compare addresses regardless of casing", () => {
    const addr1 = "0x6b175474e89094c44da98b954eedeac495271d0f";
    const addr2 = "0x6B175474E89094C44DA98B954EEDEAC495271D0F";
    expect(areAddressesEqual(addr1, addr2)).toBe(true);
  });

  it("should format token amounts and usd values correctly", () => {
    const formattedAmount = formatTokenAmount(100000000000000000000n, 18);
    expect(formattedAmount).toBe("100");
    const formattedUsd = formatUsdValue(100.0);
    expect(formattedUsd).toBe("$100.00");
  });
});
