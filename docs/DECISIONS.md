# UUSD Exchange — Recorded Task Decisions

Scope: the issue #47 input/selection improvements (inventory >$1 filter, token-selector source/gating, explicit Max button) plus the D1 whole-number `Max` formatting defect. Provenance is `reviews/uusd.ubq.fi/REPORT.md` §8 and the donor PRs **84/88** (implementation), **48** (Max markup and stale-input clearing), **79** (selector source of truth) and **51** (stale-quote guard and native-select readability). Current source is the authority; no donor PR was merged wholesale and no donor architecture was revived. Decisions 7-8 are the follow-up `m-uusd-redemption-refresh` lane (donor 74/76/78 salvage R1) and refresh eligibility from the existing `CentralizedRefreshService` payload rather than any donor error-path fallback.

These decisions were recorded before the implementation, as required.

## Decisions

1. **Inventory list vs. header total.** `#inventory-tokens` lists only holdings with a positive balance priced strictly above `$1.00` (`MINIMUM_DISPLAY_USD_VALUE`, shared predicate `hasDisplayableUsdValue`). The header total keeps its existing wallet-total meaning and still includes dust; it does not silently become a subtotal of the displayed rows. When every holding is dust the list shows a threshold message and the header still shows the wallet total.

2. **Selector source and dust/unpriced handling.** The token selector sources wallet balances from `inventoryBar.getBalances()` (donor 79) and applies `getSelectableWalletBalances()`: zero balances and *known* priced dust (`0 < usdValue <= $1.00`) are hidden, but nonzero holdings with **no** known positive price stay selectable and are never given an invented USD value. A hard `usdValue > 1` filter is exactly the unresolved P1 on donor 55/57 (CoW Swap can quote unpriced tokens) and is rejected here. The inventory-only `$1` predicate is shared with the selector's priced-dust branch rather than duplicated.

3. **Preloaded list gating and LUSD invariant.** The preloaded `tokenList` group is built only when no eligible wallet holding exists. LUSD is retained on every path: it is the first entry in the wallet group even when the wallet's own LUSD is dust or absent, and the preloaded path keeps/inserts LUSD first. The previous selection is preserved by address (case-insensitive); if a selected token disappears, the amount, route and exchange notifications are cleared instead of leaving a stale quote for a token that is no longer selectable. Neither optgroup is ever left hidden while holding the selected option.

4. **Auto-population vs. explicit Max.** The existing empty-input auto-population is retained (`.rules` expects it) and still fires on connect, account change, direction change and balance updates — but only while the input is empty, so a background update can never overwrite a manual amount. The new Max button is a separate explicit action that always fills the exact balance.

5. **Max button semantics.** Max is address-based and case-insensitive (`getMaxTokenBalanceByAddress` / `hasAvailableBalanceByAddress`) to avoid duplicate-symbol ambiguity. It uses the selected token for deposits and `INVENTORY_TOKENS.UUSD` for withdrawals, and is disabled while disconnected, while balances are still loading, or when the relevant token has no balance. An explicit Max click clears the stale route and exchange notifications and recalculates; if it resolves to no balance it clears the stale input instead of leaving it.

6. **Async quote generation and select readability.** A request-generation counter (`_routeRequestId`, donor 51) invalidates older quotes on amount, token, direction, account and connection changes so a slow quote cannot overwrite a newer selection. The other donor-51 correction is applied narrowly: `select`, `select option` and `select optgroup` get the existing opaque dark (`#111`) background so native choices are readable against the translucent input rule. No "Finding best route" state, no execute-button gating and no transaction/approval changes were taken from donor 51.

7. **Redemption-eligibility freshness (R1).** The 15s `CentralizedRefreshService` payload already carries `isRedeemingAllowed` (`twapPrice <= redeemThreshold`), the same condition `PriceService.calculateRedeemOutput` exposes and the init-time `_checkRedemptionStatus` consumed, so from the first refresh payload on, refresh owns eligibility: the subscriber applies that field with the recorded policy (unavailable → `redemptionsDisabled = true`, the effective swap-only choice remembered and `forceSwapOnly` forced true with the swap-only checkbox hidden/disabled; available again → `redemptionsDisabled = false` and that remembered choice restored for withdrawals), while the existing intentional deposit-direction reset and the fractional `acceptFractionalRedemption` policy in `_renderOptions` are untouched. The one-off startup status check is provisional only until that first payload, so its later success or failure is ignored and cannot overwrite newer refresh eligibility; an unrelated refresh (derived eligibility unchanged) resets nothing, and donor 74/76/78's reactive "Price Too High" error-message matching is deliberately not copied — this is a state refresh from an existing payload, not a new retry or catch-all fallback.

8. **Withdrawal quote invalidation on an eligibility transition.** Only when the transition changes the LUSD protocol/Curve choice for a withdrawal (`direction === "withdraw"` and the selected output token is LUSD collateral) does the component clear the displayed quote, render the cleared output before recalculating, advance `_routeRequestId` so a quote issued before the transition cannot win, cancel a pending amount debounce so the current amount is quoted exactly once, and recalculate with the accepted `redemptionsDisabled || forceSwapOnly` policy; a non-LUSD CoW output selection is unaffected and is never silently rewritten to LUSD, and deposit or unrelated refreshes invalidate nothing.

## D1 — whole-number Max formatting

`getMaxTokenBalance` and the new address-based lookup both format through `formatBalanceForInput`: whole-number `formatUnits` output (`"1000"`, `"10"`, `"2500"`) is returned unchanged, and trailing zeros are trimmed only inside an existing fractional part (`"1.500000"` → `"1.5"`, `"1.000000"` → `"1"`, `"0"` → `"0"`, `"0.0001"` → `"0.0001"`). The old `/\.?0+$/` substitution corrupted whole numbers (`"1000"` → `"1"`); donor 65/82/83 retain that bug and were not copied.

## Deliberate deviations from donor 84/88 (recorded)

- Donor 84/88 **removes** `_autoPopulateMaxBalance` and the auto-populate calls; this task retains them per decision 4.
- Donor 84/88 recomputes the inventory header total from the displayed set; this task keeps the wallet total per decision 1.
- Donor 84/88 lists only eligible wallet balances, which can drop LUSD from the selector; this task guarantees LUSD in the visible group per decision 3.
- Donor 84/88 filters the selector with the strict `>$1` predicate, hiding unpriced tokens; this task keeps them selectable per decision 2.

## Untouched prior-lane work

The decimals-aware visibility threshold (`getMinimumVisibleTokenAmount` / `MINIMUM_VISIBLE_TOKEN_AMOUNT` in `src/utils/token-utils.ts`, D2) is already integrated and tested. `getBalanceDisplay` stays (it is covered by `src/utils/token-utils.test.ts`). `token-utils.ts` and its test are unchanged by this task.
