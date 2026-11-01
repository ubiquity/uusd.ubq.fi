import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test";
import type { TokenBalance } from "../src/types/inventory.types.ts";
import type { RefreshData } from "../src/services/centralized-refresh-service.ts";

// Keep these component regressions offline; no wallet, RPC, or routing SDK is needed.
function formatUnits(value: bigint, decimals: number): string {
  const scale = 10n ** BigInt(decimals);
  const fraction = (value % scale).toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${value / scale}${fraction ? `.${fraction}` : ""}`;
}

function parseUnits(value: string, decimals: number): bigint {
  const [integer, fraction = ""] = value.split(".");
  return BigInt(integer + fraction.padEnd(decimals, "0"));
}

mock.module("viem", () => ({
  formatUnits,
  parseUnits,
  formatEther: (value: bigint) => formatUnits(value, 18),
  parseEther: (value: string) => parseUnits(value, 18),
}));
mock.module("../src/services/wallet-service.ts", () => ({ WALLET_EVENTS: {} }));
mock.module("../src/services/optimal-route-service.ts", () => ({ OptimalRouteService: class {} }));

const { InventoryBarComponent } = await import("../src/components/inventory-bar-component.ts");
const { SimplifiedExchangeComponent } = await import("../src/components/simplified-exchange-component.ts");
const { INVENTORY_TOKENS } = await import("../src/types/inventory.types.ts");

type Inventory = InstanceType<typeof InventoryBarComponent>;

// The selector uses only these DOM operations. Model selection loss on option removal
// so restoring the selected address is exercised, rather than assumed by the fixture.
class Element {
  children: Element[] = [];
  parent: Element | null = null;
  style = { display: "" };
  attributes = new Map<string, string>();
  text = "";
  textContent = "";
  private _value = "";

  constructor(readonly tag: string) {}

  get options(): Element[] {
    return this.children.flatMap((child) => child.tag === "option" ? [child] : child.options);
  }

  get selectedOptions(): Element[] {
    const option = this.options.find((candidate) => candidate.value === this._value) ?? this.options[0];
    return option ? [option] : [];
  }

  get value(): string {
    return this.tag === "select" ? this.selectedOptions[0]?.value ?? "" : this._value;
  }

  set value(value: string) {
    this._value = value;
  }

  get firstChild(): Element | null {
    return this.children[0] ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: Element): void {
    this.insertBefore(child, null);
  }

  insertBefore(child: Element, before: Element | null): void {
    child.remove();
    child.parent = this;
    this.children.splice(before ? this.children.indexOf(before) : this.children.length, 0, child);
  }

  remove(): void {
    if (!this.parent) return;
    let root: Element = this.parent;
    while (root.parent) root = root.parent;
    if (root.tag === "select" && root.value === this.value) root.value = "";
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }

  querySelectorAll(selector: string): Element[] {
    const address = selector.match(/^option\[value="(.*)"i\]$/)?.[1];
    return this.options.filter((option) => !address || option.value.toLowerCase() === address.toLowerCase());
  }

  querySelector(selector: string): Element | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

const originalDocument = globalThis.document;
let elements: Record<string, Element>;
const account = "0x0000000000000000000000000000000000000001";
const usdcAddress = "0x00000000000000000000000000000000000000aA";
const secondUsdcAddress = "0x00000000000000000000000000000000000000Bb";

beforeEach(() => {
  spyOn(console, "log").mockImplementation(() => {});
  elements = Object.fromEntries([
    ["tokenSelect", new Element("select")],
    ["yourTokenGroup", new Element("optgroup")],
    ["otherTokenGroup", new Element("optgroup")],
    ["amountLabel", new Element("label")],
    ["exchangeAmount", new Element("input")],
  ]);
  elements.tokenSelect.appendChild(elements.yourTokenGroup);
  elements.tokenSelect.appendChild(elements.otherTokenGroup);
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      getElementById: (id: string) => elements[id] ?? null,
      querySelector: (selector: string) => elements[selector.slice(1)] ?? null,
      createElement: (tag: string) => new Element(tag),
    },
  });
});

afterEach(() => {
  Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  mock.restore();
});

function holding(address: TokenBalance["address"], symbol: string, balance = 3n * 10n ** 18n): TokenBalance {
  return { address, symbol, balance, decimals: 18, usdValue: 3 };
}

function createInventory(balances: TokenBalance[] = []): Inventory {
  const inventory = Object.create(InventoryBarComponent.prototype) as Inventory;
  Object.assign(inventory, {
    _state: { isConnected: true, isLoading: false, balances, totalUsdValue: 0, currentAccount: account },
    _services: {
      walletService: {
        getAccount: () => account,
        getPublicClient: () => ({ call: async () => ({ data: "0x29a2241af62c0000" }) }),
      },
    },
    _balanceUpdateCallbacks: [],
    _initialLoadResolver: null,
    _renderBalances: () => {},
    _renderLoadingState: () => {},
    _showBackgroundRefreshIndicator: () => {},
    _hideBackgroundRefreshIndicator: () => {},
    _calculateUsdValue: async () => 3,
  });
  return inventory;
}

function refresh(inventory: Inventory, balances: TokenBalance[]): void {
  inventory["_handleRefreshData"]({ tokenBalances: balances } as RefreshData);
}

function createExchange(inventory: Inventory, lastBalances: TokenBalance[] = []) {
  const exchange = Object.create(SimplifiedExchangeComponent.prototype) as InstanceType<typeof SimplifiedExchangeComponent>;
  const quotedAddresses: string[] = [];
  Object.assign(exchange, {
    _state: { direction: "deposit", amount: "", routeResult: null },
    _services: {
      inventoryBar: inventory,
      walletService: { getAccount: () => account, isConnected: () => true },
      centralizedRefreshService: { getLastData: () => ({ tokenBalances: lastBalances }) },
    },
    _renderOptions: () => {},
    _renderOutput: () => {},
    _calculateRoute: async () => {
      quotedAddresses.push(exchange["_getSelectedToken"]().address);
    },
  });
  exchange["_setupBalanceSubscription"]();
  return { exchange, quotedAddresses };
}

test("same-symbol holdings stay distinct and address casing does not duplicate the cache", () => {
  const inventory = createInventory();
  refresh(inventory, [holding(usdcAddress, "USDC"), holding(secondUsdcAddress, "USDC")]);
  refresh(inventory, [holding(usdcAddress.toLowerCase() as TokenBalance["address"], "USDC", 4n)]);
  expect(inventory.getBalances()).toHaveLength(2);
  expect(inventory.getBalances().find((balance) => balance.address.toLowerCase() === usdcAddress.toLowerCase())?.balance).toBe(4n);

  const { exchange } = createExchange(inventory);
  exchange["_render"]();
  expect(elements.yourTokenGroup.options.map((option) => option.value.toLowerCase())).toEqual([
    usdcAddress.toLowerCase(),
    secondUsdcAddress.toLowerCase(),
  ]);
});

test("nonzero holdings remain selectable and update even without USD pricing", () => {
  const inventory = createInventory([holding(usdcAddress, "USDC", 0n)]);
  refresh(inventory, [{ ...holding(usdcAddress, "USDC", 1n), usdValue: undefined }]);
  expect(inventory.getBalances()[0].balance).toBe(1n);
  const { exchange } = createExchange(inventory);
  exchange["_render"]();
  expect(elements.yourTokenGroup.options.map((option) => option.value)).toContain(usdcAddress);
});

test("a partial core refresh preserves other holdings and the selected address", async () => {
  const lusd = holding(INVENTORY_TOKENS.LUSD.address, "LUSD");
  const usdc = holding(usdcAddress, "USDC");
  const inventory = createInventory([lusd, usdc]);
  const { exchange } = createExchange(inventory, [lusd]);
  exchange["_render"]();
  elements.tokenSelect.value = usdcAddress;
  await inventory["_loadBalances"]();

  expect(inventory.getBalances().map((balance) => balance.address)).toContain(usdcAddress);
  expect(inventory.getBalances()).toHaveLength(4);
  expect(elements.tokenSelect.value).toBe(usdcAddress);
  expect(elements.amountLabel.textContent).toBe("USDC");
});

test("fallback options and labels follow transitions between empty and nonzero inventory", () => {
  const inventory = createInventory();
  const { exchange } = createExchange(inventory);
  exchange["_render"]();
  expect(elements.tokenSelect.value).toBe(INVENTORY_TOKENS.LUSD.address);
  expect(elements.amountLabel.textContent).toBe("LUSD");
  expect(elements.otherTokenGroup.style.display).toBe("");

  refresh(inventory, [{ ...holding(usdcAddress, "USDC"), usdValue: undefined }]);
  expect(elements.tokenSelect.value).toBe(usdcAddress);
  expect(elements.amountLabel.textContent).toBe("USDC");
  expect(elements.otherTokenGroup.style.display).toBe("none");

  refresh(inventory, [holding(usdcAddress, "USDC", 0n)]);
  expect(elements.tokenSelect.value).toBe(INVENTORY_TOKENS.LUSD.address);
  expect(elements.amountLabel.textContent).toBe("LUSD");
  expect(elements.yourTokenGroup.style.display).toBe("none");
  expect(elements.otherTokenGroup.style.display).toBe("");
});

test("the amount label and auto-populated quote follow the restored fallback token", () => {
  const lusd = holding(INVENTORY_TOKENS.LUSD.address, "LUSD");
  const ubq = holding(INVENTORY_TOKENS.UBQ.address, "UBQ");
  const inventory = createInventory([lusd, ubq]);
  const lastBalances = [lusd, ubq];
  const { exchange, quotedAddresses } = createExchange(inventory, lastBalances);
  exchange["_render"]();
  elements.tokenSelect.value = ubq.address;
  exchange["_render"]();
  expect(elements.amountLabel.textContent).toBe("UBQ");

  lastBalances[1] = { ...ubq, balance: 0n, usdValue: 0 };
  refresh(inventory, [lastBalances[1]]);
  expect(elements.tokenSelect.value).toBe(lusd.address);
  expect(elements.amountLabel.textContent).toBe("LUSD");
  expect(elements.exchangeAmount.value).toBe("3");
  expect(quotedAddresses).toEqual([lusd.address]);

  exchange["_state"].direction = "withdraw";
  exchange["_render"]();
  expect(elements.amountLabel.textContent).toBe("UUSD");
});
