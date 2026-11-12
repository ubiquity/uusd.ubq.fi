import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import type { TokenBalance, TokenMetadata } from "../src/types/inventory.types.ts";
import { INVENTORY_TOKENS } from "../src/types/inventory.types.ts";
import { MIN_VISIBLE_USD_VALUE } from "../src/constants/numeric-constants.ts";
import tokenList from "../src/constants/token-list.json" with { type: "json" };

// Keep these UI tests offline and independent of wallet/RPC initialization.
function parseUnits(value: string, decimals: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

function formatUnits(value: bigint, decimals: number): string {
  if (decimals === 0) return value.toString();
  const digits = value.toString().padStart(decimals + 1, "0");
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`.replace(/\.?0+$/, "");
}

mock.module("viem", () => ({
  parseUnits,
  formatUnits,
  parseEther: (value: string) => parseUnits(value, 18),
  formatEther: (value: bigint) => formatUnits(value, 18),
}));
mock.module("../src/services/wallet-service.ts", () => ({ WALLET_EVENTS: {} }));
mock.module("../src/components/icons.ts", () => ({ default: { LUSD: "LUSD", UBQ: "UBQ", UUSD: "UUSD" } }));
mock.module("../src/services/optimal-route-service.ts", () => ({ OptimalRouteService: class {} }));

const { SimplifiedExchangeComponent } = await import("../src/components/simplified-exchange-component.ts");
const { InventoryBarComponent } = await import("../src/components/inventory-bar-component.ts");
const { isTokenBalanceVisible } = await import("../src/utils/token-utils.ts");

// Only the DOM operations used by token rendering are needed here.
class TestElement {
  children: TestElement[] = [];
  parent: TestElement | null = null;
  style = { display: "" };
  attributes = new Map<string, string>();
  disabled = false;
  selected = false;
  text = "";
  textContent = "";
  innerHTML = "";
  private _value = "";

  constructor(readonly tag: string) {}

  get options(): TestElement[] {
    return this.children.flatMap((child) => (child.tag === "option" ? [child] : child.options));
  }

  get value(): string {
    if (this.tag !== "select") return this._value;
    return this.options.find((option) => option.value === this._value)?.value ?? this.options[0]?.value ?? "";
  }

  set value(value: string) {
    this._value = value;
  }

  get selectedOptions(): TestElement[] {
    return this.options.filter((option) => option.value === this.value);
  }

  appendChild(child: TestElement) {
    child.parent = this;
    this.children.push(child);
  }

  replaceChildren() {
    this.children = [];
  }

  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }

  querySelector(selector: string) {
    expect(selector).toBe('option[value=""]');
    return this.options.find((option) => option.value === "") ?? null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
}

let elements: Map<string, TestElement>;
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

beforeEach(() => {
  elements = new Map(
    ["tokenSelect", "yourTokenGroup", "otherTokenGroup", "exchangeAmount", "inventory-tokens", "inventory-total"].map((id) => [
      id,
      new TestElement(id === "tokenSelect" ? "select" : "div"),
    ])
  );
  element("tokenSelect").appendChild(element("yourTokenGroup"));
  element("tokenSelect").appendChild(element("otherTokenGroup"));
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      getElementById: (id: string) => elements.get(id) ?? null,
      createElement: (tag: string) => new TestElement(tag),
    },
  });
});

afterEach(() => {
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else Reflect.deleteProperty(globalThis, "document");
});

function element(id: string): TestElement {
  const result = elements.get(id);
  if (!result) throw new Error(`Missing test element: ${id}`);
  return result;
}

function balance(token: TokenMetadata, usdValue?: number): TokenBalance {
  return { ...token, balance: parseUnits("1.5", token.decimals), usdValue };
}

function createExchange(balances: TokenBalance[] = [], direction: "deposit" | "withdraw" = "deposit") {
  const services = {
    walletService: { isConnected: () => true },
    inventoryBar: { getBalances: mock(() => balances), isInitialLoadComplete: () => true },
    centralizedRefreshService: { getLastData: mock(() => ({ tokenBalances: balances.slice(0, 1) })) },
    cowSwapService: { getDepositRoute: mock(async () => null), getWithdrawRoute: mock(async () => null) },
  };
  const optimalRouteService = { getOptimalDepositRoute: mock(async () => null), getOptimalWithdrawRoute: mock(async () => null) };
  return Object.assign(Object.create(SimplifiedExchangeComponent.prototype), {
    _services: services,
    _optimalRouteService: optimalRouteService,
    _state: { direction, amount: "", routeResult: null, isCalculating: false, useUbqDiscount: false },
    _renderOutput: mock(),
  }) as {
    _services: typeof services;
    _optimalRouteService: typeof optimalRouteService;
    _state: { direction: "deposit" | "withdraw"; amount: string; routeResult: unknown; isCalculating: boolean };
    _renderOutput: ReturnType<typeof mock>;
    _renderTokenOptions(): void;
    _getSelectedToken(): TokenMetadata | null;
    _autoPopulateMaxBalance(): void;
    _calculateRoute(): Promise<void>;
  };
}

test("priced dust uses the shared USD threshold; unavailable prices do not hide nonzero tokens", () => {
  for (const usdValue of [undefined, 0, NaN, Infinity, -Infinity, -1, MIN_VISIBLE_USD_VALUE, 1]) {
    expect(isTokenBalanceVisible({ ...balance(INVENTORY_TOKENS.UBQ, usdValue), balance: 1n })).toBe(true);
    expect(isTokenBalanceVisible({ ...balance(INVENTORY_TOKENS.UBQ, usdValue), balance: 0n })).toBe(false);
  }
  expect(isTokenBalanceVisible(balance(INVENTORY_TOKENS.LUSD, MIN_VISIBLE_USD_VALUE / 2))).toBe(false);
});

test("inventory and deposit wallet options apply the same dust rule", () => {
  const balances = [
    balance(INVENTORY_TOKENS.LUSD, MIN_VISIBLE_USD_VALUE / 2),
    balance(INVENTORY_TOKENS.UBQ),
    { ...balance(INVENTORY_TOKENS.UUSD, 1), balance: 0n },
  ];
  const inventory = Object.assign(Object.create(InventoryBarComponent.prototype), {
    _state: { isConnected: true, balances, totalUsdValue: 0 },
  }) as { _renderBalances(): void };
  inventory._renderBalances();
  const exchange = createExchange(balances);
  exchange._renderTokenOptions();
  expect(element("inventory-tokens").innerHTML).toContain("UBQ");
  expect(element("inventory-tokens").innerHTML).not.toContain("LUSD");
  expect(element("yourTokenGroup").options.map((option) => option.value)).toEqual([INVENTORY_TOKENS.UBQ.address]);
  expect(element("otherTokenGroup").options).toHaveLength(0);
});

test("nonzero wallet tokens remain selectable for missing and unavailable USD prices", () => {
  for (const usdValue of [undefined, 0, NaN, Infinity]) {
    const exchange = createExchange([{ ...balance(INVENTORY_TOKENS.UBQ, usdValue), balance: 1n }]);
    exchange._renderTokenOptions();
    expect(exchange._getSelectedToken()?.address).toBe(INVENTORY_TOKENS.UBQ.address);
  }
});

test("empty deposit selection neither calculates a route nor max-fills from LUSD", async () => {
  const exchange = createExchange([balance(INVENTORY_TOKENS.LUSD, MIN_VISIBLE_USD_VALUE / 2)]);
  exchange._renderTokenOptions();
  expect(element("tokenSelect").options).toHaveLength(1);
  expect(element("tokenSelect").options[0].disabled).toBe(true);
  expect(exchange._getSelectedToken()).toBeNull();
  exchange._state.amount = "2";
  exchange._state.routeResult = { routeType: "mint" };
  await exchange._calculateRoute();
  exchange._state.amount = "";
  exchange._autoPopulateMaxBalance();
  expect(exchange._state.routeResult).toBeNull();
  expect(exchange._state.isCalculating).toBe(false);
  expect(exchange._state.amount).toBe("");
  expect(element("exchangeAmount").value).toBe("");
  expect(exchange._services.cowSwapService.getDepositRoute).not.toHaveBeenCalled();
  expect(exchange._optimalRouteService.getOptimalDepositRoute).not.toHaveBeenCalled();
});

test("missing selector or selected option returns no token", () => {
  const exchange = createExchange();
  expect(exchange._getSelectedToken()).toBeNull();
  elements.delete("tokenSelect");
  expect(exchange._getSelectedToken()).toBeNull();
});

test("merged inventory keeps wallet entries and selection across partial refreshes", () => {
  const balances = [balance(INVENTORY_TOKENS.LUSD, 1), balance(INVENTORY_TOKENS.UBQ, 1)];
  const exchange = createExchange(balances);
  exchange._renderTokenOptions();
  element("tokenSelect").value = INVENTORY_TOKENS.UBQ.address;
  exchange._renderTokenOptions();
  expect(element("yourTokenGroup").options.map((option) => option.value)).toEqual(balances.map((token) => token.address));
  expect(exchange._getSelectedToken()?.address).toBe(INVENTORY_TOKENS.UBQ.address);
  expect(exchange._services.centralizedRefreshService.getLastData).not.toHaveBeenCalled();
});

test("withdraw includes supported outputs alongside wallet tokens without address duplicates", () => {
  const heldLusd = { ...balance(INVENTORY_TOKENS.LUSD, 1), address: INVENTORY_TOKENS.LUSD.address.toLowerCase() as `0x${string}` };
  const exchange = createExchange([heldLusd, balance(INVENTORY_TOKENS.UBQ, 0)], "withdraw");
  exchange._renderTokenOptions();
  const addresses = element("tokenSelect").options.map((option) => option.value.toLowerCase());
  expect(new Set(addresses).size).toBe(addresses.length);
  for (const token of tokenList) expect(addresses).toContain(token.address.toLowerCase());
  expect(element("yourTokenGroup").options.map((option) => option.value)).toContain(INVENTORY_TOKENS.UBQ.address);
  expect(element("otherTokenGroup").options.map((option) => option.value)).toContain(tokenList[1].address);
});

test("withdraw outputs remain selected when moving into and out of wallet balances", () => {
  const balances = [balance(INVENTORY_TOKENS.LUSD, 1)];
  const exchange = createExchange(balances, "withdraw");
  exchange._renderTokenOptions();
  const output = { ...tokenList[1], address: tokenList[1].address as `0x${string}` };
  element("tokenSelect").value = output.address;
  balances.push(balance(output, 1));
  exchange._renderTokenOptions();
  expect(exchange._getSelectedToken()?.address).toBe(output.address);
  expect(element("yourTokenGroup").options.map((option) => option.value)).toContain(output.address);
  balances.pop();
  exchange._renderTokenOptions();
  expect(exchange._getSelectedToken()?.address).toBe(output.address);
  expect(element("otherTokenGroup").options.map((option) => option.value)).toContain(output.address);
});

test("withdraw still offers supported outputs without any wallet balances", () => {
  const exchange = createExchange([], "withdraw");
  exchange._renderTokenOptions();
  expect(element("otherTokenGroup").options.length).toBeGreaterThan(1);
  expect(exchange._getSelectedToken()?.address).toBe(INVENTORY_TOKENS.LUSD.address);
});

test("a real wallet selection can max-fill and calculate a CowSwap deposit", async () => {
  const exchange = createExchange([balance(INVENTORY_TOKENS.UBQ, 0)]);
  exchange._renderTokenOptions();
  exchange._autoPopulateMaxBalance();
  await Promise.resolve();
  expect(element("exchangeAmount").value).toBe("1.5");
  expect(exchange._state.amount).toBe("1.5");
  expect(exchange._services.cowSwapService.getDepositRoute).toHaveBeenCalledWith(
    { address: INVENTORY_TOKENS.UBQ.address, symbol: "UBQ", decimals: 18 },
    parseUnits("1.5", 18)
  );
  expect(exchange._optimalRouteService.getOptimalDepositRoute).not.toHaveBeenCalled();
});

test("the empty placeholder is replaced when a wallet token becomes available", () => {
  const balances: TokenBalance[] = [];
  const exchange = createExchange(balances);
  exchange._renderTokenOptions();
  expect(exchange._getSelectedToken()).toBeNull();
  balances.push(balance(INVENTORY_TOKENS.UBQ, 0));
  exchange._renderTokenOptions();
  expect(element("tokenSelect").options).toHaveLength(1);
  expect(exchange._getSelectedToken()?.address).toBe(INVENTORY_TOKENS.UBQ.address);
  balances.pop();
  exchange._renderTokenOptions();
  expect(exchange._getSelectedToken()).toBeNull();
});

test("withdraw max uses UUSD while selling into a supported token not held by the wallet", async () => {
  const exchange = createExchange([balance(INVENTORY_TOKENS.UUSD, 1)], "withdraw");
  exchange._renderTokenOptions();
  const output = tokenList[1];
  element("tokenSelect").value = output.address;
  exchange._autoPopulateMaxBalance();
  await Promise.resolve();
  expect(element("exchangeAmount").value).toBe("1.5");
  expect(exchange._services.cowSwapService.getWithdrawRoute).toHaveBeenCalledWith(
    { address: output.address, symbol: output.symbol, decimals: output.decimals },
    parseUnits("1.5", INVENTORY_TOKENS.UUSD.decimals)
  );
});
