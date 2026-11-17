# UI-PROOF — issue #47 selector/Max acceptance on the served page

Real components, synthetic injected wallet/balance/quote services. **No real wallet, no provider keys, no
transaction, no approval, no signature.** Port 3000 may be occupied; never attach to, stop or restart an existing
server or browser.

**Runnable form (preferred).** `.cleanup-evidence/browser-proof.ts` implements this plan end to end: it serves this
lane's `public/` itself on `127.0.0.1:3210`, drives the built page through the agent-browser CLI with the injected
`.cleanup-evidence/acceptance-fixture.js`, and writes
`.cleanup-evidence/acceptance/{transcript.txt,summary.json,desktop-1440x900.png,narrow-390x844.png}`. The exact command is
in `HANDBACK.md`; `deno task build` must run first because the 056 source correction postdates the last bundle. The
manual serve below remains a fallback for reproducing single cases by hand.

**Correction 056 covered by the driver.** An explicit Max now cancels a pending amount debounce and renders the cleared
output (`#exchangeOutput` hidden, `#exchangeButton` disabled) *before* its own quote starts, so no previous quote or
enabled exchange action survives while Max's quote is deliberately delayed (driver case D1).

## 0. Serve this worktree only

```sh
deno task build                # bundles src/app.ts -> public/app.js (uses whichever esbuild deno has cached)
PORT=3210 deno task serve:dev  # existing PORT env var; default is 3000
```

Open `http://localhost:3210` with a private/incognito profile. The page's own startup may attempt RPC before the
harness runs (pre-existing app behaviour); the harness below stops the refresh cycle immediately. If the proof must be
fully hermetic, block requests to the RPC/Alchemy hosts in the browser before load — nothing in the harness depends on
them.

## 1. Inject (paste in the served page console, after load)

```js
const app = window.app;
const inventory = app._inventoryBarComponent;
const exchange = app._simplifiedExchangeComponent;
const refresh = app._centralizedRefreshService;
const wallet = app._walletService;
const cow = app._cowSwapService;

const ACCOUNT = "0x1111111111111111111111111111111111111111";
const LUSD = "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0";
const UUSD = "0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103";
const UBQ = "0x4e38d89362f7e5db0096ce44ebd021c3962aa9a0";
const USDC = "0x00000000000000000000000000000000000000c2";
const DUST = "0x00000000000000000000000000000000000000d1";

refresh.stop();                                   // stop the 15s provider cycle
refresh._performRefresh = async () => {};         // and its provider calls
wallet.getAccount = () => ACCOUNT;
wallet.isConnected = () => true;
inventory._state.isConnected = true;
inventory._state.currentAccount = ACCOUNT;
inventory._initialLoadResolver = null;            // balances reported as loaded

const token = (symbol, address, balance, decimals, usdValue) => ({ symbol, address, balance, decimals, usdValue });
const emit = (tokenBalances) => {
  const data = {
    uusdPrice: "1.000000", lusdPrice: 1000000n, ubqPrice: 1000n, tokenBalances,
    collateralRatio: 650000000000000000n, allCollaterals: [LUSD], mintThreshold: 1000000n, redeemThreshold: 1000000n,
    curveExchangeRate: 0n, isMintingAllowed: true, isRedeemingAllowed: true, twapPrice: 1000000n,
  };
  refresh._lastData = data;
  refresh._callbacks.forEach((cb) => cb(data));    // drives the real subscriber callbacks
};

const route = (direction, routeType, inputSymbol, inputAddress, inputDecimals, inputAmount, expectedOutput) => ({
  routeType, expectedOutput, direction,
  outputToken: { address: UUSD, symbol: "UUSD", decimals: 18 },
  inputToken: { address: inputAddress, symbol: inputSymbol, decimals: inputDecimals },
  inputAmount, marketPrice: 1000000n, pegPrice: 1000000n, savings: { amount: 0n, percentage: 0 }, isEnabled: true,
});
cow.getDepositRoute = async (t, a) => route("deposit", "cowswap", t.symbol, t.address, t.decimals, a, 990000000000000000000n);
cow.getWithdrawRoute = async (t, a) => route("withdraw", "cowswap", "UUSD", UUSD, 18, a, 990000000000000000000n);
cow.getCowSwapSdk = () => ({ getCowProtocolAllowance: async () => 0n });
exchange._optimalRouteService.getOptimalDepositRoute = async (a) => route("deposit", "mint", "LUSD", LUSD, 18, a, 990000000000000000000n);
exchange._optimalRouteService.getOptimalWithdrawRoute = async (a) => route("withdraw", "redeem", "UUSD", UUSD, 18, a, 990000000000000000000n);

const input = document.getElementById("exchangeAmount");
const select = document.getElementById("tokenSelect");
const max = document.getElementById("maxButton");
const yourGroup = document.getElementById("yourTokenGroup");
const otherGroup = document.getElementById("otherTokenGroup");
const symbols = (group) => [...group.querySelectorAll("option")].map((o) => o.getAttribute("data-symbol"));
const rows = () => [...document.querySelectorAll("#inventory-tokens .token-balance")].map((el) => el.querySelector(".token-amount").textContent.trim());
const total = () => document.getElementById("inventory-total").textContent;
const preview = () => document.getElementById("expectedOutput").textContent;
const type = (v) => { input.value = v; input.dispatchEvent(new Event("input", { bubbles: true })); };
const pick = (address) => { select.value = address; select.dispatchEvent(new Event("change", { bubbles: true })); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
```

Common payload for C1/C2 (reset `inventory._state.balances = []` before each new payload so merged state cannot leak):

```js
inventory._state.balances = [];
emit([
  token("LUSD", LUSD, 12500000000000000000n, 18, 12.5),
  token("USDC", USDC, 1000000000n, 6, 1000),
  token("DUST", DUST, 500000n, 6, 0.5),
  token("UBQ", UBQ, 5000000000000000000n, 18, 0),
  token("UUSD", UUSD, 0n, 18, 0),
]);
await wait(150);
```

## 2. Cases and exact expected observations

| # | Case | Action | Expected (exact) |
| --- | --- | --- | --- |
| C1 | >\$1 rows, dust hidden, unpriced kept | payload above | `rows()` = `["12.5","1,000"]` with `document.querySelectorAll("#inventory-tokens .token-balance").length === 2` (DUST, unpriced UBQ and zero UUSD absent); `symbols(yourGroup)` = `["LUSD","USDC","UBQ"]`; `symbols(otherGroup)` = `[]` and `otherGroup.style.display` = `"none"` |
| C2 | header total keeps wallet total incl. dust | same payload | `total()` = `"$1,013.00"` (12.50 + 1000 + 0.50; a displayed subtotal would be `"$1,012.50"`) |
| C3 | LUSD available with dust LUSD | `inventory._state.balances = []; emit([token("USDC",USDC,1000000000n,6,1000), token("LUSD",LUSD,50000000000000000n,18,0.05)])`; `pick(LUSD)` | `symbols(yourGroup)` = `["LUSD","USDC"]`; `#amountLabel` = `"Amount (LUSD)"`; `max.disabled === false`; click → `input.value === "0.05"` |
| C4 | no eligible holdings → preloaded list | `inventory._state.balances = []; emit([token("UUSD",UUSD,0n,18,0)])` | `yourGroup.style.display === "none"` and 0 options; `otherGroup.style.display === ""`; first option `data-symbol === "LUSD"` and `select.options.length === 343` |
| C5 | 1000 USDC Max is exact (D1) | re-emit the C1 payload (`inventory._state.balances = []` first), `pick(USDC)`, `max.click()` | `input.value === "1000"` (not `"1"`); `input.value` unchanged after a second `emit(...)` of the same payload |
| C6 | quote recalcs after Max | continue C5, `await wait(150)` | `preview()` = `"990"`; `#exchangeButton` text starts with `"Approve USDC"` (allowance stub `0n`) |
| C7 | manual amount preserved | `type("2")`, `await wait(1200)`, re-`emit` C1 payload, `await wait(150)` | `input.value === "2"` and `preview()` still `"990"` (the 2-USDC quote; the background update did not overwrite the manual amount) |
| C8 | stale async quote discarded | `cow.getDepositRoute = async (_t, a) => (a === 1000000n ? (await wait(1500), route("deposit","cowswap","USDC",USDC,6,a,111n)) : route("deposit","cowswap","USDC",USDC,6,a,1980000000000000000n))`; `type("1")`; `await wait(1200)`; `type("2")`; `await wait(1100)` | `preview() === "1.98"` and `input.value === "2"` |
| C8b | older quote cannot overwrite the newer one | continue C8: `await wait(700)` (old 1-USDC quote resolves after the new one) | `preview()` is still `"1.98"` (never `"0.000000000000000111"`) |
| C9 | disconnected disables Max | `wallet.getAccount = () => null; wallet.isConnected = () => false; exchange._render()` | `max.disabled === true` |
| C10 | loading disables Max | restore account; `inventory._initialLoadResolver = () => {}; exchange._render()` | `max.disabled === true`; `input.disabled === true`; `input.placeholder === "Loading balances..."`; then `inventory._initialLoadResolver = null; exchange._render()` restores both |
| C11 | no balance disables Max (withdraw uses UUSD) | `document.getElementById("withdrawButton").click(); await wait(150)` | `max.disabled === true` (UUSD balance is 0); `#amountLabel` = `"Amount (UUSD)"` |
| C12 | native select readable (D3) | at any point | `getComputedStyle(select).backgroundColor === "rgb(17, 17, 17)"`; `getComputedStyle(input).backgroundColor === "rgba(0, 0, 0, 0)"` |

Optional pass (only if the primary wants to check the real network path): repeat C5 with a real wallet-less read of
`cow.getDepositRoute`; not required and not part of this acceptance.

Note on `preview()`: when the amount changes, the implementation clears the shown route and hides `#exchangeOutput`
until the debounced quote resolves, so `preview()` is only asserted after the waits above (the hidden element keeps its
last text, and asserting mid-recalculation would read a stale node).

## 3. Explicitly out of scope for this proof

- No `#exchangeButton` click: `executeTransaction`, approvals, CoW order posting and signing are never exercised.
- No real wallet connect/disconnect; connected state is synthetic.
- Unit-level coverage of `trimFormattedBalance`, the predicate functions and address matching lives in
  `src/utils/balance-utils.test.ts` (`bun test src/utils/balance-utils.test.ts`).
