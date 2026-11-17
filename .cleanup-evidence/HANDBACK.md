# HANDBACK — issue #47 input/selection improvements + D1 whole-number Max (donors 84/88/48/79/51)

## Lane

- Worktree: `/home/codex/repos/ubiquity/uusd.ubq.fi/.codex-worktrees/plan-m-uusd-selector-max-ab19eeac3be`
- Branch: `codex/plan-m-uusd-selector-max-ab19eeac3be`
- Base / HEAD: `5b123169e0df5d3771427c09fdd4c1c275641f68` (unchanged; no commits, no push, no PR, no children, no background jobs)
- Status: 5 modified + 2 new files, nothing else. `git status --porcelain` = `M public/index.html`, `M public/styles/main.css`,
  `M src/components/inventory-bar-component.ts`, `M src/components/simplified-exchange-component.ts`, `M src/utils/balance-utils.ts`,
  `?? docs/DECISIONS.md`, `?? src/utils/balance-utils.test.ts` (plus `.cleanup-evidence/`, untracked by policy).
- Provenance: `reviews/uusd.ubq.fi/REPORT.md` §3/§4/§8 and donor diffs 84, 88, 48, 79, 51. Current source is the authority.

## Changes

| File | sha256 | Change |
| --- | --- | --- |
| `src/utils/balance-utils.ts` | `f81236669d480bd3ab73a07a2d534144fe503f2978d121b0ee32975a20aaf935` | `MINIMUM_DISPLAY_USD_VALUE = 1`; `trimFormattedBalance` + `formatBalanceForInput` (D1); `getMaxTokenBalance` now formats through it; new `getMaxTokenBalanceByAddress` / `hasAvailableBalanceByAddress` (case-insensitive via `areAddressesEqual`); `hasDisplayableUsdValue` / `getDisplayableBalances` (inventory, strict `>$1`); `isSelectableWalletBalance` / `getSelectableWalletBalances` (selector: hide known priced dust, keep unpriced). `getBalanceDisplay` untouched. |
| `src/components/inventory-bar-component.ts` | `e027d32023f96424457a4f33f44c774b50a50fabaa7d974a85c320ddd5c253ab` | `_renderBalances` uses `getDisplayableBalances`; dust-only message names the `$1.00` threshold; header total stays `_state.totalUsdValue` (wallet total incl. dust). |
| `src/components/simplified-exchange-component.ts` | `f6b52fda7fae5bf21229ef8d9160572edd966d2c7d3080087a47263e2ccb4652` | Selector sourced from `inventoryBar.getBalances()` + `getSelectableWalletBalances`, LUSD-first on every path, preloaded `tokenList` only when no eligible holdings, selection restored by address with stale amount/route cleared; `_createTokenOption` helper; Max button wiring (`_getMaxBalanceToken` / `_hasMaxAvailableBalance` / `_updateMaxButton` / `_handleMaxAmountClick` / `_clearStaleAmount`); `_routeRequestId` nonce invalidating old quotes on amount/token/direction/account/connection changes; auto-populate only while the input is empty; amount label reflects the actual input token. **Correction 056** (see below): Max cancels a pending amount debounce and renders the cleared output before starting its own quote. |
| `public/index.html` | `2f16059b004e99cb386c9b24b136e9bc5248cfe17576bb6f2106ff5df2d03738` | `<label for="exchangeAmount" id="amountLabel" class="amount-label">` + `.amount-input-row` + `#maxButton` (`disabled` initially, title "Use maximum available balance"). |
| `public/styles/main.css` | `73253c7d94d40fbcec341157dd8971edf32cabe51096f70cb97910b7a76b9094` | Native select readability: `select, select option, select optgroup { background-color:#111; color:#fff; }` while `input` stays transparent. New `.amount-label`, `.amount-input-row`, `.max-button`, `.max-button:disabled`. |
| `src/utils/balance-utils.test.ts` | `894c93995be86a59f59723253eb4061342aaef42136b79d7a7c1d45f7d54de43` | New `bun:test` regression: `trimFormattedBalance` on `1000/10/2500/1.500000/1.000000/0.0001/0/0.0`; `formatBalanceForInput` through real raw balances; symbol + address Max with duplicate symbols and case-insensitive match; `hasAvailableBalanceByAddress`; `hasDisplayableUsdValue`/`getDisplayableBalances`; `getSelectableWalletBalances` unpriced-vs-dust. No network, no wallet. |
| `docs/DECISIONS.md` | `4fdd66c7d952413b6c6b65601fc03fe492a8893a9bc569f8667c0101720c56bd` | The six resolved decisions plus the D1 rule and the recorded deviations from donor 84/88. Written before implementation. |
| `.cleanup-evidence/browser-proof.ts` | `43f79dd29eaf2f1d8f4964f9759e33417d7006437d6d224a66ee1094806848ca` | Runnable Deno proof driver: serves this lane's `public/` on `127.0.0.1:3210`, drives `open/select/fill/click/snapshot/screenshot` through agent-browser, asserts C1-C12 + delayed-Max pending state + stale-quote ordering + no-balance Max race, writes screenshots/transcript/summary. **057:** strict closure evidence — the exact-session envelope must parse with `success:true`, matching namespace/session and `runtimeError:null`, then show either an explicit `browserLaunched:false`+`pageCount:0` runtime or the fully evidenced absent-daemon form (`runtime:null`+`active:false`+`pid:null`); anything else fails closed, and neither `active` alone nor `session list` is ever proof. Raw envelopes are kept in the transcript. A ~150 s main budget and a separate ~30 s cleanup budget are enforced at every command/poll/hold boundary (no `Promise.race`), and every spawned CLI command is awaited or killed by its own timeout before cleanup proceeds. |
| `.cleanup-evidence/acceptance-fixture.js` | (new, 056) | Injected synthetic wallet/balance/quote/approval services exposing `window.__proof` (`load/setMode/setConnected/setLoading/dropBalance/render/observe`). |
| `.cleanup-evidence/agent-browser.json` | (new, 056) | Task-only `{}` browser config, passed with `--config` to avoid user defaults. |
| `.cleanup-evidence/UI-PROOF.md` | (untracked evidence) | Acceptance plan; the driver above is its runnable form. |

## Donor attribution and corrections

### Correction 056 (accepted product correction from the primary)

`_handleMaxAmountClick` cleared `_state.routeResult` but never rendered that cleared state before awaiting the new
quote, so the previous quote and an enabled `#exchangeButton` stayed on screen while Max's request was in flight. The
minimal fix in `src/components/simplified-exchange-component.ts` only:

```ts
// before try: an explicit Max owns the amount
if (this._debounceTimer) {
  clearTimeout(this._debounceTimer);
  this._debounceTimer = null;
}
// in the success path, after clearing routeResult/notifications and before void this._calculateRoute():
this._renderOutput();
```

No new helper, loading design or transaction change; generation guards (`_routeRequestId`), manual amounts, protocol
economics, slippage, approvals, CoW SDK and submission paths are untouched, and the no-balance branch already went
through `_clearStaleAmount()` (which renders). The driver proves it with a deliberately delayed Max quote and also covers
the no-balance Max race.

- **84/88 (implementation).** Predicates/constant placement, selector rebuild with `replaceChildren`, `_createTokenOption`, address-based lookups, D1 formatter, Max disabled-state logic. Corrections taken deliberately (recorded in `docs/DECISIONS.md`): (a) `_autoPopulateMaxBalance` and its connect/account/balance-update calls are **retained** — 84 deletes them; (b) header total keeps wallet meaning — 84 recomputes a displayed subtotal; (c) LUSD is guaranteed in the visible group — 84 lists only eligible balances and can drop LUSD; (d) unpriced/zero-priced nonzero holdings stay selectable — 84's strict `>$1` filter is the unresolved P1 on 55/57; (e) used the report's `MINIMUM_DISPLAY_USD_VALUE` name instead of 84's `MIN_DISPLAY_USD_VALUE`; (f) D1 formatter split into `trimFormattedBalance(string)` + `formatBalanceForInput(TokenBalance)` so the required `"1.500000"`-style inputs are directly testable (viem's `formatUnits` never emits trailing fractional zeros, so a raw-balance-only test cannot cover that string).
- **48 (Max markup, stale-input clearing).** `#maxButton` id and `.amount-input-row` wrapper, clearing stale input when Max resolves to no balance, `change`/`click` wiring. Corrections: 48's dust rule (`usdValue == null || usdValue >= 1`) is replaced by the shared strict `>$1` predicate (the `== null` clause is the bug the report flags); no solid `#2a2a3e` button background — the button keeps the existing transparent/box-shadow brand treatment with only a disabled opacity; disabled-state logic comes from 84 (address, loading, disconnected).
- **79 (selector source of truth).** `inventoryBar.getBalances()` as the source, `_createTokenOption`, selection restore by address. Corrections: 79's `balance > 0n` filter is replaced by the dust/unpriced predicate of decision 2; the preloaded list is gated instead of appended on every render.
- **51 (narrowly, stale quote + readability).** Only `_routeRequestId` request-generation invalidation and the opaque `#111` select background were taken. Not taken: the "Finding best route" state, `_renderOutput` no-route messaging change, execute-button gating, `resetAllButtons()`, and 51's `bun.lock`/typescript bump (lockfiles are out of scope).
- **66/67 (D2)** and the prior decimals lane are untouched: `token-utils.ts`, its test, `getMinimumVisibleTokenAmount`, `MINIMUM_VISIBLE_TOKEN_AMOUNT` and `getBalanceDisplay` are unchanged.

## Verification status

**Not executed here**, per assignment: no install, test, typecheck, lint, build, format, browser, server or provider call was
run in this worker; no formatter was run (prettier is not installed in this worktree). Preparation-only checks: the 056
`node --check` parse (parse only, never execution) covered the previous revision of the component and driver; the 057
driver edits were reviewed by hand and smoke-checked with a string/template-scrubbed bracket balance (braces 114/114,
parens 341/341), and `node --check` was deliberately not repeated after 057. The changed files were written to
`.prettierrc` conventions (2 spaces, double quotes, semicolons, width 160, es5 trailing commas). **These edits and the
driver are prepared, not complete** until the primary rebuilds, runs the focused test and runs the served-UI proof.

### Exact commands for the primary relay

```sh
# 0) optional parse-only check of the authored driver/fixture before the first run (no execution):
node --check .cleanup-evidence/browser-proof.ts && node --check .cleanup-evidence/acceptance-fixture.js

# 1) isolated install: `bun install --frozen-lockfile` is known to fail on this repo's lock mismatch - do not retry it.
#    The prior decimals lane's frozen deno install worked without lock changes; node_modules is absent in this worktree.

# 2) focused regression (bun:test, established by the prior decimals lane; no package/task added)
bun test src/utils/balance-utils.test.ts

# 3) existing repo checks, unchanged commands
npm run typecheck     # tsc --noEmit
npm run lint          # eslint src --ext .ts
npm run format:check  # prettier --check 'src/**/*.ts'

# 4) rebuild after the 056 source correction, then run the served-UI proof driver from the lane root.
#    The driver serves public/ itself on 127.0.0.1:3210, so no serve:dev subprocess and no port 3000 use.
deno task build
deno run --allow-net=127.0.0.1:3210,deno.land:443 --allow-read=public,.cleanup-evidence --allow-write=.cleanup-evidence --allow-run=/home/codex/.local/bin/agent-browser --allow-env=HOME,TMPDIR .cleanup-evidence/browser-proof.ts
# evidence: .cleanup-evidence/acceptance/{transcript.txt,summary.json,desktop-1440x900.png,narrow-390x844.png,launch-attempted.marker}

# 5) formatter only if format:check flags these files (prettier not installed here):
npx prettier --write src/utils/balance-utils.ts src/utils/balance-utils.test.ts src/components/inventory-bar-component.ts src/components/simplified-exchange-component.ts docs/DECISIONS.md
```

The driver is least-permission for what it does: loopback bind only (`127.0.0.1:3210`), `deno.land:443` only for the
cold-cache std `serveDir` module, read of `public/` + `.cleanup-evidence/`, write only into `.cleanup-evidence/`, and
`--allow-run` limited to the agent-browser binary. It hard-refuses (exit 1, nothing launched, nothing closed) when the
named session already reports a live browser or when `127.0.0.1:3210` is occupied.

Driver assertion coverage: C1 rows/dust/unpriced/group gating, C2 wallet-total header, C3 dust-LUSD availability +
exact `0.05` Max, C4 preloaded-list-only path (343 options, LUSD first), C5 `1000` USDC Max exact + preserved across a
background refresh, C6 quote recalculation (`990`, `Approve USDC`), delayed-Max pending state (cleared output, disabled
action, zero stale preview while the quote is provably in flight), C7 manual amount preserved, C8 older-quote ordering
(the 4 s quote resolving after the newer `1.98` never renders), R1 no-balance Max race (input cleared, pending debounce
cancelled, no quote with `at > clickAt` for 1.4 s), C9 disconnected, C10 loading/restored, C11 withdraw-UUSD no-balance
disabled, C12 native select/input computed backgrounds. Waits are bounded state predicates (`poll`) or bounded negative
invariants (`hold`); no fixed sleeps.

Expected focused result (derived by inspection, not executed): **13 pass / 0 fail, 32 `expect()` calls**. The D1
discriminating assertion is `getMaxTokenBalance(bar, "USDC")` for a 1000-USDC (6-decimal) holding returning `"1000"`:
base formats to `"1000"` and the old `/\.?0+$/` regex returns `"1"`. All other new symbols (`trimFormattedBalance`,
`formatBalanceForInput`, `getMaxTokenBalanceByAddress`, `hasAvailableBalanceByAddress`, `hasDisplayableUsdValue`,
`getDisplayableBalances`, `getSelectableWalletBalances`, `MINIMUM_DISPLAY_USD_VALUE`) do not exist on base.

### Missing runtime dependencies

- `node_modules` is absent in this worktree; `bun test` needs `viem` (and `@types/bun` for typecheck) installed. Primary
  owns the isolated install.
- `deno task build`/`serve:dev` fetch `npm:esbuild@0.25.12` and the std file-server via Deno's cache (network).
- `prettier`/`eslint`/`tsc` are not runnable here until install.

## Rough edges

1. **Not yet proven here** (see above). The riskiest unexecuted pieces are the DOM-level selector rewrite, the label
   read, the request-id guard and the Max clear-then-quote ordering; the driver above is the intended check, and the
   primary's rebuild must happen after the 056 correction because `public/app.js` currently predates it.
2. **Typing still hides the route preview during recalculation.** `_handleAmountChange` immediately clears `routeResult`
   (honest: no stale quote is shown for a new amount) and `_renderOutput` hides `#exchangeOutput` until the 1 s debounce
   plus quote returns. Donor 51's "Finding best route…" state was deliberately not added because only the select
   readability and the new button/label styles were sanctioned. If the primary wants the output to remain visible while
   recalculation is pending, that is a follow-up decision, not a regression in the request-id guard.
3. **Correction 056 fixes the Max ordering:** `_handleMaxAmountClick` now cancels `_debounceTimer` and calls
   `_renderOutput()` on the cleared route before `_calculateRoute()`, so a previous quote and an enabled exchange action
   cannot survive while Max's own quote is pending (`#exchangeOutput` is hidden and `#exchangeButton` is disabled with
   its existing no-route text; the hidden node keeps its last text, which is invisible to users and not a new loading
   design). The driver asserts this while the fixture proves the new quote is still in flight.
4. **LUSD is always the first "Your Tokens" entry**, even when the wallet's own LUSD is dust or absent. Max then uses the
   exact raw balance if one exists (e.g. `"0.05"`) and is disabled if none exists. This is decision 2/3, and it is the
   deliberate `.rules` "keep a fallback" tension; recorded in `docs/DECISIONS.md`.
5. **`_state.isCalculating` is kept in sync by the request-id guard but is still not used for rendering** (unchanged from
   base, where it was also unused). No donor-51 execute-button gating was added.
6. **Symbol-based `getMaxTokenBalance`/`hasAvailableBalance` remain** because `_autoPopulateMaxBalance` still calls them;
   the address-based pair is used only by Max. Both paths now share the D1 formatter.
7. **Visible markup additions**: the amount label and Max button are new DOM inside `#input`; in deposit mode the token
   select renders above them (pre-existing insertion point), so the order is select → label → input+Max.
8. **`docs/DECISIONS.md` is the first decision record in this repo** (report §10 noted none existed); it records the
   header-total meaning and the preloaded-list gating as required.
9. **Driver assumptions the primary should know** (all fail loudly rather than silently weaken): the CLI is expected to
   accept the documented global flags (`--namespace/--session/--config/--executable-path/--allowed-domains/--idle-timeout`)
   on every call, `select "#tokenSelect" <address>` to match the option *value*, and `eval --stdin` to print the returned
   expression; the driver extracts its own base64 sentinel, so CLI decorations cannot corrupt assertions. A failing
   `session info --json` is treated as a refusal (never as "no browser"), and `--idle-timeout 30s` means any daemon the
   CLI started exits within ~30 s of the last command; the named session is reported in the transcript if cleanup cannot
   settle. The child environment is only PATH/HOME/TMPDIR with `clearEnv`, so if agent-browser needs another variable the
   CLI error is preserved in the transcript. No credentials, profiles, restore state, CDP or plugins are used.
10. Preserved untouched: protocol economics, slippage (50 bps), approvals, CoW SDK and transaction submission paths,
    `token-utils.ts` + its test, `getBalanceDisplay`, and UUSD `0xb6919Ef2ee4aFC163BC954C5678e2BB570c2D103`.
