#!/usr/bin/env bun

// Offline regression checks: bun run tools/test-cowswap-integration.ts
// Minimal DOM fixture; routing/RPC dependencies are not exercised.
import { mock } from "bun:test";

class TestElement extends EventTarget {
  id = "";
  label = "";
  type = "";
  disabled = false;
  style: Record<string, string> = {};
  classList = { add() {}, remove() {}, toggle() {} };
  parentElement: TestElement | null = null;
  children: TestElement[] = [];
  attributes = new Map<string, string>();
  innerHTML = "";
  text = "";
  private _value = "";

  constructor(readonly tagName: string) {
    super();
  }
  get firstChild() {
    return this.children[0] ?? null;
  }
  get options(): TestElement[] {
    return this.children.flatMap((child) => child.tagName === "option" ? [child] : child.options);
  }
  get value(): string {
    return this.tagName === "select" ? this._value || this.options[0]?.value || "" : this._value;
  }
  set value(value: string) {
    this._value = value;
  }
  get selectedOptions() {
    return this.options.filter((option) => option.value === this.value);
  }
  get textContent(): string {
    return this.innerHTML.replace(/<[^>]*>/g, "") || this.text;
  }
  set textContent(text: string) {
    this.text = text;
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
    if (name === "disabled") this.disabled = true;
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name === "disabled") this.disabled = false;
  }
  appendChild(child: TestElement) {
    return this.insertBefore(child, null);
  }
  insertBefore(child: TestElement, reference: TestElement | null) {
    child.remove();
    child.parentElement = this;
    this.children.splice(reference ? this.children.indexOf(reference) : this.children.length, 0, child);
    return child;
  }
  remove() {
    let select: TestElement | null = this.parentElement;
    while (select && select.tagName !== "select") select = select.parentElement;
    const wasSelected = select?.value === this.value;
    if (this.parentElement) this.parentElement.children = this.parentElement.children.filter((child) => child !== this);
    this.parentElement = null;
    if (select && wasSelected) select.value = select.options[0]?.value ?? "";
  }
  querySelectorAll(selector: string): TestElement[] {
    if (selector === "option") return [...this.options];
    const value = selector.match(/^option\[value="(.+)"i\]$/)?.[1];
    if (value) return this.options.filter((option) => option.value.toLowerCase() === value.toLowerCase());
    return this.children.flatMap((child) => [
      ...(selector === `#${child.id}` ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  querySelector(selector: string) {
    return this.querySelectorAll(selector)[0] ?? null;
  }
  click() {
    if (!this.disabled) this.dispatchEvent(new Event("click"));
  }
}

const body = new TestElement("body");
function add(tag: string, id: string, parent = body) {
  const element = new TestElement(tag);
  element.id = id;
  return parent.appendChild(element);
}
const input = add("div", "input");
add("input", "exchangeAmount", input);
const maxButton = add("button", "maxAmountButton", input);
maxButton.type = "button";
maxButton.disabled = true;
add("span", "ubqOutput", add("div", "output"));
add("button", "depositButton");
add("button", "withdrawButton");
const inventoryTokens = add("div", "inventory-tokens");
add("span", "inventory-total");
const testDocument = {
  getElementById: (id: string) => body.querySelector(`#${id}`),
  querySelector: (selector: string) => body.querySelector(selector),
  createElement: (tag: string) => new TestElement(tag),
  querySelectorAll: (selector: string) =>
    selector === ".token-symbol"
      ? [...inventoryTokens.innerHTML.matchAll(/<div class="token-symbol">([^<]*)<\/div>/g)].map((match) => ({ textContent: match[1] }))
      : body.querySelectorAll(selector),
};
Object.assign(globalThis, { document: testDocument, requestAnimationFrame: (callback: () => void) => setTimeout(callback, 0) });

function formatUnits(value: bigint, decimals: number): string {
  const digits = value.toString().padStart(decimals + 1, "0");
  if (!decimals) return digits;
  const fraction = digits.slice(-decimals).replace(/0+$/, "");
  return digits.slice(0, -decimals) + (fraction ? "." + fraction : "");
}
function parseUnits(value: string, decimals: number): bigint {
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole + fraction.padEnd(decimals, "0").slice(0, decimals));
}
mock.module(
  "viem",
  () => ({ formatUnits, parseUnits, formatEther: (value: bigint) => formatUnits(value, 18), parseEther: (value: string) => parseUnits(value, 18) }),
);
mock.module("../src/services/wallet-service.ts", () => ({ WALLET_EVENTS: { CONNECT: "connect", DISCONNECT: "disconnect", ACCOUNT_CHANGED: "account" } }));
mock.module("../src/services/optimal-route-service.ts", () => ({ OptimalRouteService: class {} }));
mock.module("../src/utils/batch-request-utils.ts", () => ({
  batchFetchTokenBalances() {
    throw new Error("Unexpected RPC call");
  },
}));

const report = console.log;

async function runComponentTests() {
  const results: string[] = [];
  function check(condition: unknown, message: string) {
    if (!condition) throw new Error(message);
    results.push(message);
  }

  try {
    const { SimplifiedExchangeComponent } = await import("../src/components/simplified-exchange-component.ts");
    const { InventoryBarComponent } = await import("../src/components/inventory-bar-component.ts");
    const { TransactionStateService } = await import("../src/services/transaction-state-service.ts");
    const { INVENTORY_TOKENS } = await import("../src/types/inventory.types.ts");
    const markup = await Bun.file("public/index.html").text();
    const maxMarkup = markup.match(/<button[^>]*id="maxAmountButton"[^>]*>/)?.[0];
    check(maxMarkup?.includes('type="button"') && maxMarkup.includes("disabled"), "Max markup is a non-submit button disabled before initialization");

    const amountInput = document.getElementById("exchangeAmount") as HTMLInputElement;
    const maxButton = document.getElementById("maxAmountButton") as HTMLButtonElement;
    check(maxButton.type === "button" && maxButton.disabled, "Max cannot submit the form and starts disabled");

    let connected = false;
    let loaded = true;
    let balances: import("../src/types/inventory.types.ts").TokenBalance[] | null = null;
    let cachedBalances: import("../src/types/inventory.types.ts").TokenBalance[] = [];
    let calculations = 0;
    const transactions = TransactionStateService.getInstance();
    const exchange = Object.create(SimplifiedExchangeComponent.prototype);
    Object.assign(exchange, {
      _state: { direction: "deposit", amount: "", routeResult: null },
      _services: {
        walletService: { isConnected: () => connected, getAccount: () => connected ? INVENTORY_TOKENS.LUSD.address : null },
        centralizedRefreshService: { getLastData: () => ({ tokenBalances: balances }) },
        inventoryBar: { getBalances: () => cachedBalances, isInitialLoadComplete: () => loaded },
        notificationManager: { clearNotifications() {} },
      },
      _transactionStateService: transactions,
      _calculateRoute: () => {
        calculations++;
        return Promise.resolve();
      },
      _renderOptions() {},
      _renderOutput() {},
    });

    exchange._initTokenSelectAndLabel();
    const select = document.getElementById("tokenSelect") as HTMLSelectElement;
    check(select.options.length > 100 && select.value === INVENTORY_TOKENS.LUSD.address, "Token list is preloaded without wallet data");
    const usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";
    select.value = usdcAddress;
    const usdc = { symbol: "USDC", address: usdcAddress as `0x${string}`, decimals: 6, balance: 1234567n, usdValue: 1.234567 };
    balances = [usdc];
    exchange._renderTokenOptions();
    check(
      select.value === usdcAddress && select.selectedOptions[0].parentElement?.id === "yourTokenGroup",
      "Refresh preserves selection when moving a preloaded token to Your Tokens",
    );
    exchange._renderTokenOptions();
    check(
      [...select.options].filter((option) => option.value.toLowerCase() === usdcAddress.toLowerCase()).length === 1,
      "Repeated refreshes do not duplicate tokens",
    );
    balances = null;
    exchange._renderTokenOptions();
    check(
      select.value === usdcAddress && select.selectedOptions[0].parentElement?.id === "otherTokenGroup",
      "Disconnect restores the preloaded list without losing selection",
    );

    exchange._setupEventListeners();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    exchange._render();
    check(maxButton.disabled, "Max is disabled without a connected wallet");
    connected = true;
    loaded = false;
    exchange._render();
    check(maxButton.disabled, "Max is disabled while balances load");
    loaded = true;
    balances = [];
    cachedBalances = [usdc];
    exchange._render();
    check(maxButton.disabled, "A fresh empty balance list does not reuse stale cached balances");

    // Matching by address, not symbol, must work even with a conflicting token.
    balances = [{ ...usdc, address: INVENTORY_TOKENS.UBQ.address, balance: 999999999n }, { ...usdc, address: usdcAddress.toLowerCase() as `0x${string}` }];
    exchange._render();
    amountInput.value = "0.5";
    exchange._autoPopulateMaxBalance();
    check(amountInput.value === "0.5", "Background auto-population preserves a manually entered amount");
    let staleCalculation = false;
    exchange._debounceTimer = setTimeout(() => {
      staleCalculation = true;
    }, 0);
    maxButton.click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    check(
      amountInput.value === "1.234567" && exchange._state.amount === "1.234567" && calculations === 1 && !staleCalculation,
      "Max replaces input with the exact address-matched six-decimal balance and recalculates once",
    );

    balances = [{ ...usdc, balance: 10000000n }];
    exchange._render();
    maxButton.click();
    check(amountInput.value === "10", "Max preserves significant zeros in whole-token balances");
    balances = [{ ...usdc, balance: 1n, usdValue: 0.000001 }];
    exchange._render();
    maxButton.click();
    check(amountInput.value === "0.000001", "Dust remains spendable even when hidden in inventory");
    balances = [{ ...INVENTORY_TOKENS.UUSD, balance: 10000000000000000001n, usdValue: 10 }];
    exchange._state.direction = "withdraw";
    exchange._render();
    maxButton.click();
    check(amountInput.value === "10.000000000000000001", "Withdraw Max uses UUSD, not the selected output token, without rounding");

    transactions.registerButton("test", { buttonElement: document.createElement("button"), originalText: "Swap", pendingText: "Pending" });
    transactions.startTransaction("test");
    exchange._render();
    check(maxButton.disabled, "Max is disabled during an active transaction");
    transactions.disableAllInteractiveElements();
    const previousAmount = amountInput.value;
    exchange._autoPopulateMaxBalance(0, true);
    check(maxButton.disabled && amountInput.value === previousAmount, "Transaction input locking also locks Max");

    const inventory = Object.create(InventoryBarComponent.prototype);
    const holdings = [
      { ...usdc, symbol: "VISIBLE", usdValue: 1.01 },
      { ...usdc, symbol: "BOUNDARY", usdValue: 1 },
      { ...usdc, symbol: "DUST", usdValue: 0.99 },
      { ...usdc, symbol: "UNPRICED", usdValue: undefined },
      { ...usdc, symbol: "ZERO", balance: 0n, usdValue: 2 },
      { ...usdc, symbol: "VALUABLE_TINY", balance: 1n, decimals: 18, usdValue: 3 },
    ];
    inventory._state = { isConnected: true, balances: holdings, totalUsdValue: 6 };
    inventory._renderBalances();
    const symbols = [...document.querySelectorAll(".token-symbol")].map((element) => element.textContent);
    check(symbols.join(",") === "VISIBLE,VALUABLE_TINY", "Inventory displays only positive holdings strictly over $1, regardless of token quantity");
    check(inventory.getBalances().length === holdings.length, "Inventory filtering does not discard underlying balances");
    inventory._state.balances = [holdings[2]];
    inventory._state.totalUsdValue = 0.99;
    inventory._renderBalances();
    check(
      document.getElementById("inventory-tokens")?.textContent === "No token balances over $1.00" &&
        document.getElementById("inventory-total")?.textContent === "$0.99",
      "Dust-only inventory has an explicit empty state and retains the actual total",
    );
    report(`${results.length} component checks passed\n${results.join("\n")}`);
  } catch (error) {
    console.error(`${results.length} checks passed before failure`);
    throw error;
  }
}

console.log = () => {};
try {
  await runComponentTests();
} finally {
  console.log = report;
}
