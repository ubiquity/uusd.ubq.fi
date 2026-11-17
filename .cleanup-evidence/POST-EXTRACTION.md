POST-EXTRACTION RECONCILIATION 062 — UUSD reviews/uusd.ubq.fi dispositions vs integrated code

Authority: lane plan-m-uusd-selector-max-ab19eeac3be at HEAD 9463ed2cb48647e6b4dcb69d5256e1c489896fb8 (canonical
main, source committed, only .cleanup-evidence/ untracked). Read-only: no product edit, no GitHub mutation, no tests.
Scope: the 27 disposition rows still marked implementation_required: 45,48,51,52,55,56,57,58,59,64,65,70,71,72,74,
76,78,79,80,81,84,85,87,88,89,90,91. No blanket all-covered claim; every row is classified from the integrated code
and docs/DECISIONS.md (decisions at lines 9-19, recorded deviations at 25-31).

Status counts: covered 14, covered by duplicate 3, rejected by recorded decision 6, remaining delta 4 (two distinct
deltas, one shared by 74/76/78 and one by 45).

PER-ROW RECONCILIATION (status | integrated evidence | concise reason)

45 remaining_delta (blocked prerequisite) — see "45 / AppKit" below.
48 covered (+attribution) — index.html:48-51 (#maxButton, .amount-input-row) and main.css:843-864 taken from its
  markup/CSS shape; public/styles/main.css:38 implements the select readability separately; the stale-input clear on
  no-balance Max is covered at simplified-exchange-component.ts:514 (_clearStaleAmount). Corrections: its
  `usdValue == null || usdValue >= 1` clause is rejected (decision 1/2 strict > with `usdValue ?? 0`, balance-utils.ts:106)
  and its symbol-based Max is replaced by address-based Max (decision 5, balance-utils.ts:60/92). Keep-open/credit is a
  PR-hygiene action, not a code delta.
51 covered + rejected_by_decision — CSS: main.css:38 (`select, select option, select optgroup` #111) taken; nonce:
  `_routeRequestId` at simplified-exchange-component.ts:52 with increments at 301,315,328,443,538,569,588,633,641 and
  1312 plus guards at 669/675, covering every amount/token/direction/account/connection mutation (donor's ~14 sites
  verified against our mutation points, not applied blindly). Its "Finding best route..." output state, `_renderOutput`
  no-route messaging change, execute-button gating and bun.lock bump are deliberately rejected (DECISIONS.md:19).
52 covered + rejected placement — strict `>` predicate with `usdValue ?? 0` is covered as hasDisplayableUsdValue
  (balance-utils.ts:106) and inventory-side wiring as getDisplayableBalances (113); `_getVisibleBalances` maps to the
  same filter used by inventory-bar-component.ts:423; selection preservation is `_restoreSelectedToken`
  (simplified-exchange-component.ts:225). Its token-utils.ts home is a rejected alternative placement (decision 1).
55 covered + rejected semantics — `_updateMaxButtonState` shape is covered by `_updateMaxButton`
  (simplified-exchange-component.ts:478) with loading/disconnected/no-balance gating (486); its two P1s are resolved by
  decision 2 (unpriced tokens stay selectable, balance-utils.ts:123) and the vanished-selection clearing path (234).
  Its `>= 1` dust filter is rejected.
56 rejected_by_decision + covered handlers — `_renderMaxButton`/`_setAmountToMaxBalance` are covered by
  `_updateMaxButton`/`_handleMaxAmountClick` (478/495); its constant placement (types module) is a rejected alternative
  (balance-utils.ts:15 chosen); its total recomputed from visible balances is the mutually exclusive alternative
  deliberately rejected by decision 1 (inventory-bar-component.ts:427/451 keeps the wallet total incl. dust).
57 rejected_by_decision — total recompute rejected (decision 1); raw-RefreshData rebuild rejected (decision 2 sources
  the selector from inventoryBar.getBalances(), simplified-exchange-component.ts:178); `""`-valued placeholder rejected
  (decision 3 guarantees LUSD in the visible group and a preloaded fallback instead of a placeholder option).
58 rejected_by_decision — dedicated token-visibility-constants module rejected (balance-utils.ts:15 chosen); hiding the
  whole otherTokenGroup/LUSD is rejected by the LUSD invariant (simplified-exchange-component.ts:186-190, 200).
59 covered — LUSD-first ordering (simplified-exchange-component.ts:186-190), Max handlers (478/495) and
  `_restoreSelectedToken` (225) are covered; its unresolved withdraw-mode P1 (removing token-list outputs) does not
  apply because the selector still lists wallet tokens and always keeps LUSD, and cross-direction changes are
  re-rendered through `_initTokenSelectAndLabel`/`_switchDirection` (586-624).
64 covered by invariant + rejected extras — the empty-select hazard is eliminated structurally (LUSD always present,
  preloaded fallback only when no eligible holding, `replaceChildren` rebuild) rather than by disabled placeholders;
  address-based getMaxTokenBalanceByAddress/hasAvailableBalanceByAddress are covered (balance-utils.ts:60/92). Its
  configurable minUsdValue parameter is a rejected alternative (single shared constant per decision 1).
65 rejected — its `formatBalanceForInput`/`cleanBalance` refactor keeps the D1 regex and is rejected (D1 fixed at
  balance-utils.ts:23-38, DECISIONS.md:21-23); its zero-balance input fix is covered by `_clearStaleAmount`
  (simplified-exchange-component.ts:514/534) and the empty-input-only auto-populate rule (decision 4,
  simplified-exchange-component.ts:1281).
70 covered + rejected extras — MIN_USD_VALUE wiring is covered by MINIMUM_DISPLAY_USD_VALUE
  (balance-utils.ts:15, inventory-bar-component.ts:11/426) and the dust+preload+Max iteration is integrated
  (simplified-exchange-component.ts:178-204, 478-533); its numeric-constants placement and the restored unused timeout
  constants (MAX_BUTTON_GAS_RESERVE etc.) are rejected (no new unused config).
71 covered shape + rejected behavior — `_applyMaxBalance` shape maps to `_handleMaxAmountClick`
  (simplified-exchange-component.ts:495); the review-mandated inversion is respected: a manually entered amount is
  never cleared by Max, only the no-balance branch clears (514) and background auto-populate runs only while the input
  is empty (decision 4). Its input-clearing behavior is the rejected defect.
72 covered by duplicate / superseded — its MIN_USD_VALUE wiring is covered as above; the broad `_loadBalances` /
  `_calculateRoute` rewrite is rejected (no architecture revival); the `switch`-case block-scope nit is moot in the
  integrated code (no new unbraced case declarations).
74 remaining_delta (fallback) + covered/rejected parts — group-title hiding is covered in stronger form: the whole
  inactive optgroup is hidden (simplified-exchange-component.ts:192-204). `usdValue == null` is rejected (decision 2).
  Its `.max-button` hover/`:focus` series notes are not taken (brand treatment kept, main.css:854-864; UA focus ring
  retained). Its redemption fallback on the route "Price Too High" error path is the remaining delta R1 below.
76 covered predicate + remaining_delta (fallback) — its strict `typeof usdValue === "number"` intent is covered by
  `balance.balance > 0n && (usdValue ?? 0) > MINIMUM_DISPLAY_USD_VALUE` (balance-utils.ts:106), which also removes its
  `>=` vs "above $1.00" ambiguity; package-lock/deno churn rejected. Its threshold-error matching is the same R1 delta.
78 covered predicate + no output-token defect + remaining_delta (fallback) — the strict predicate intent is covered
  (balance-utils.ts:106); the CodeRabbit "forced LUSD fallback does not sync the selected output token" defect has no
  counterpart in the integrated code: the withdraw output token is always the selected option itself
  (`_calculateRoute` 652-666 routes through getWithdrawRoute for non-LUSD and the optimal service for LUSD, and
  `_renderOutput` 1011 formats with `routeResult.outputToken.decimals`), the LUSD fallback is pre-emptive
  (`redemptionsDisabled`/`forceSwapOnly`, 663) and a vanished selection clears amount+route+notifications
  (`_restoreSelectedToken` 225-241). Its "price too high" message normalization maps to R1. Lockfile/deno churn rejected.
79 covered — single source of truth inventoryBar.getBalances() (simplified-exchange-component.ts:178), `_createTokenOption`
  (213) and selection restore (225). CodeRabbit's case-sensitivity finding is fixed: assignment goes through the matched
  option element (`selectEl.value = previousOption.value`, 229) after the areAddressesEqual search (226).
80 covered by duplicate (identical diff to 79); no separate work.
81 rejected_by_decision + rejected comparator — the `""`-placeholder pattern is unnecessary: the select is never empty
  by construction (LUSD always in the visible group; preloaded fallback only when no eligible holding), so no
  placeholder is needed; its token-utils predicate home is a rejected placement (balance-utils.ts:106) and its `>=`
  comparator is rejected (strict >, issue #47 wording + CodeRabbit finding).
84 covered (primary source) with the two recorded deviations — helper/predicate/address helpers/D1 regex/LUSD-first/
  preload gate/restore-with-clear/Max handlers are integrated (balance-utils.ts:15-141,
  simplified-exchange-component.ts:178-241, 462-533). Deliberate deviations recorded at DECISIONS.md:25-31: header total
  keeps wallet meaning (decision 1) instead of 84's displayed subtotal, and empty-input auto-population is retained
  (decision 4) instead of 84's removal. Its `_updateMaxButton` per-render state re-query is retained unchanged
  (simplified-exchange-component.ts:486-488) — trivial, nonblocking.
85 covered — MINIMUM_DISPLAY_USD_VALUE + hasDisplayableUsdValue (balance-utils.ts:15/106) and the production-function
  regression test at src/utils/balance-utils.test.ts (13 tests: 1.00/0.99/undefined/1.01 plus D1 1000/10/2500/1.500000/
  0/0.0001 and address matching) cover the helper+test ask; its AGENTS.md/PROGRESS.md/setup.sh/lock scaffolding and the
  zero-option select control flow are rejected.
87 covered + rejected deletion — inventory-bar threshold message wording is covered
  (inventory-bar-component.ts:426); the test shape/location is covered by the production-function test above rather than
  its inline re-implementation. Its token-list deletion is the mutually exclusive alternative rejected by decision 3
  (preload gated, not deleted), which also preserves tools/token-list.ts:28.
88 covered (co-primary) with the same recorded deviations — its inlined predicate is covered by the shared
  hasDisplayableUsdValue, and loading-aware Max by `_updateMaxButton` (486). Its findBalanceByAddress extraction is a
  stylistic alternative not needed (inline areAddressesEqual in balance-utils.ts:66/94).
89 covered by duplicate (identical to 88); no separate work.
90 covered — LUSD exemption is subsumed by the stronger always-present LUSD invariant
  (simplified-exchange-component.ts:186-190, 200); its minimal single-file shape and preload gate are integrated
  (178-204); its remove-sweep defect cannot occur because both groups are rebuilt with replaceChildren (181-182); its
  `<= 1` wording is rejected in favour of strict > (balance-utils.ts:106/123).
91 rejected_by_decision — flat-select rebuild rejected in favour of the 84/88 optgroup structure (decision 3 and
  DECISIONS.md:25-31); deleting token-list.json rejected for the same reason (tools/token-list.ts:28 stays valid because
  the JSON remains); its currentSelectedValue capture/restore is covered by `_restoreSelectedToken` (225) and its dust
  filter + Max wiring are covered.

45 / APPKIT — EXPLICIT BLOCKED CANDIDATE (read-only inspection only)
- Useful content retained as the canonical source: src/services/appkit-wallet-service.ts (AppKitWalletService
  subclassing WalletService with connection sync/event re-emission/timeout cleanup), src/config/appkit-config.ts
  (getOrCreateAppKit + REOWN_PROJECT_ID handling), esbuild.config.ts env injection, legacy injected-provider fallback
  when the ID is unset, and widening WalletService internals to protected.
- Concrete missing prerequisite: a public Reown/WalletConnect Cloud project ID supplied as a NEW product environment
  variable (the donor's REOWN_PROJECT_ID). There is no current equivalent: no environment-variable mechanism exists in
  src (grep for Deno.env/process.env/REOWN/WALLETCONNECT/PROJECT_ID finds nothing), the only external-service constant is
  a hardcoded public RPC URL (src/contracts/constants.ts:4 ALCHEMY_URL), and package.json/deno.jsonc contain no
  wagmi/reown/walletconnect dependency.
- Added prerequisites if adopted: new dependencies (@reown/appkit + wagmi/viem adapter), build-time env injection, CI
  workflow edits, and widening WalletService internals — i.e. it adds a second wallet-connection path (WalletConnect
  modal) alongside the injected-provider flow (src/services/wallet-service.ts:29/98-130 via window.ethereum + viem
  custom transport), which is an architecture change, not a refactor of the existing path.
- User choice / approval needed: approve a new product env var and provide the public project ID (or explicitly defer
  WalletConnect support and keep injected-only wallets). Under the global rule, adding a new product env variable
  requires explicit approval, so this row stays an explicit, unstarted candidate — not silently rejected. No .env or
  credential file was read, nothing provisioned, no wallet code executed.

74 / 78 CAREFUL CHECK — OUTPUT-TOKEN SYNC AND FALLBACK
- Output-token sync (78's CodeRabbit finding): NOT reproducible in the integrated code. The withdraw output token is
  the selected option itself, and the rendered preview uses `routeResult.outputToken.decimals`
  (simplified-exchange-component.ts:1011); the forced-Curve path only applies to the LUSD-selected branch (663), and a
  selection that disappears clears amount+route+notifications (225-241). No delta.
- Fallback routing: the reactive "Price Too High" error-path fallback (74/76/78 salvage) is the remaining delta R1.

REMAINING DELTAS (exact, unstarted)
R1 — Refresh redemption-fallback freshness (74/76/78 salvage). Owned path:
  src/components/simplified-exchange-component.ts (the centralized-refresh subscriber at 265-272, which today updates
  only `mintingDisabled`, and the init-only `_checkRedemptionStatus` call at 81 / method 785-841). The data already
  exists: RefreshData.isRedeemingAllowed (src/services/centralized-refresh-service.ts:34, computed at 192/206) is never
  consumed after init, so the Curve fallback chosen by 663 can go stale without a reload.
  Acceptance: a synthetic refresh that flips isRedeemingAllowed updates `redemptionsDisabled`/`forceSwapOnly` and the
  withdraw route switches between the protocol and Curve/swap path accordingly, without a reload and without resetting
  the protocol state on unrelated updates. Dependency: none technical (no new env/deps/services); needs a routing-
  semantics decision because §8 steps 1-8 excluded it and .rules prefers explicit failure over silent fallback.
R2 — AppKit/WalletConnect (45). Blocked on the new public Reown project ID env var + explicit approval + dependencies
  as described above; nothing may be added or provisioned without that.
No other delta: every other pending row's useful content is integrated or is a mutually exclusive alternative that
DECISIONS.md already settled.

DONOR CORRECTIONS PRESERVED (attribution intact)
- 84/88 primary source with deliberate deviations (wallet total, retained auto-population, LUSD guaranteed, unpriced
  tokens selectable, D1 formatter split for string-level tests) — DECISIONS.md:25-31.
- 48 Max markup id/class + stale clear; 79 option helper/source-of-truth + case-correct restore; 51 nonce + select CSS;
  90 LUSD exemption; 85/86 helper+test; 57/59 total-recompute and LUSD-order alternatives; 91 deletion alternative.
- D2/66/67 remains integrated prior-lane work (src/utils/token-utils.ts) and is not a task.

NONBLOCKING ROUGH EDGES (honest, no new work implied)
- `.max-button` has no custom `:focus` rule (main.css:854-864); the UA focus ring is retained, and the base
  `button:hover` glow applies (main.css:27) — the brand treatment was chosen over donor 74's hover override.
- The inventory messages/total treat dust per decision 1, so the visible row sum can be lower than the header total
  (documented, not a defect).
- `_updateMaxButton` re-queries isConnected/isInitialLoadComplete per render (486-488), unchanged from donor 84; trivial.

LIMITATIONS
- Classification is against HEAD 9463ed2 source and the recorded decisions only; it does not re-run the donors, does
  not create issues/PRs, does not inspect real credentials or .env, and does not claim the deltas are wanted — only that
  they are the exact remaining useful work if the product chooses them.
- No blanket coverage claim: rows 45/74/76/78 remain open as explicit candidates (two deltas), and the rejected rows are
  closed by recorded decisions, not by omission.
- Primary accepts/copies this result; the machine-readable twin is .cleanup-evidence/post-extraction.json.
