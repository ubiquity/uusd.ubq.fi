# REDEMPTION-PROOF — R1 redemption-eligibility refresh on the served page

Prepared by worker `064-uusd-redemption-refresh`; **not executed** in the worker (no tests/build/browser in worker).
Primary registers the build and then runs the driver below under `heavy.lock`.

Real components and real DOM controls (`#withdrawButton`, `#tokenSelect`, `#exchangeAmount`); only services/state are
synthetic (`redemption-refresh-fixture.js`). No real wallet, no network quote, no signature, no approval, no transaction.
The page's own startup requests are denied by the browser's `--allowed-domains 127.0.0.1,localhost` policy.

## Preconditions

1. `deno task build` on this lane (the driver refuses a bundle that lacks `Redemption eligibility changed`).
2. No live browser in namespace `uos-pr-cleanup-01a0c790` / session `uusd-redemption`; `127.0.0.1:3210` free.
   The driver refuses (exit 1, nothing launched, nothing closed) if either is not true.
3. `/home/codex/.local/bin/agent-browser` and `/usr/bin/chromium` available.

## Exact command (from the lane root)

```sh
deno run --allow-net=127.0.0.1:3210,deno.land:443 --allow-read=public,.cleanup-evidence --allow-write=.cleanup-evidence --allow-run=/home/codex/.local/bin/agent-browser --allow-env=HOME,TMPDIR .cleanup-evidence/redemption-proof.ts
```

The driver starts its own loopback `serveDir` on `127.0.0.1:3210` (no `serve:dev`, no port 3000), launches the named
browser session with `--config .cleanup-evidence/agent-browser.json` (task-only `{}`), and closes only that session.

## Assertion coverage (real refresh subscription / route path)

| Case | Scenario (task requirement) | Asserted through the real path |
| --- | --- | --- |
| setup | baseline | withdraw + LUSD selected by DOM, manual amount `5`, protocol `redeem` quote (`forceSwapOnly=false`), checkbox visible/enabled/unchecked |
| A1a | eligibility true -> false without reload | `window.__redemption.emit({isRedeemingAllowed:false})` through `refresh._callbacks` -> `redemptionsDisabled=true`, `forceSwapOnly=true`, `#swapOnlyOption` `display:none`, checkbox checked+disabled, quote recalculated with `forceSwapOnly=true` (Curve), manual amount `5` and LUSD output token unchanged, sentinel + `installedAt` unchanged (no reload) |
| A1b | eligibility false -> true without reload | second emit -> both flags back to `false`, checkbox visible/enabled/unchecked, protocol quote recalculated (`forceSwapOnly=false`), amount/token unchanged, still no reload |
| A2 | unrelated refresh does not reset | emit with same `isRedeemingAllowed` but changed `twapPrice`/`uusdPrice`/`mintThreshold` -> amount `5`, LUSD selected, preview `5`, no new quote call; held 1.5 s |
| A3 | older protocol quote ignored after a transition | delayed first quote for amount `7` (`forceSwapOnly=false`, output `111`) observed pending, then eligibility -> false starts an immediate Curve quote (`forceSwapOnly=true`, output `222`); after the late quote resolves (`pending=0`) the preview is still `222`, force-flags for that amount are `[false, true]` |
| A4 | non-LUSD CoW output never silently switches to LUSD | select USDC (CoW withdraw route, preview `333`), then eligibility -> true; USDC stays selected, CoW call count stays `1`, preview stays `333`, no optimal-route quote is issued; held 1.5 s |
| A5 | real user swap-only choice survives true -> false -> true | click the real `#forceSwapOnly` checkbox at full collateralization (choice `true`, quote `forceSwapOnly=true`, preview `4.8`), then eligibility -> false (forced, control hidden/disabled), then -> true: `forceSwapOnly=true` restored, checkbox visible/enabled/checked, quote recalculated with the restored choice; amount `7` and LUSD selection unchanged |
| A6 | delayed provisional startup status cannot override newer refresh | real `_checkRedemptionStatus()` started against a delayed `calculateRedeemOutput` (1200 ms success with `isRedeemingAllowed=false`, then 900 ms rejection) while refresh emits `isRedeemingAllowed=true`; after `statusSettled` the state is still enabled with the A5 choice and no extra quote |
| A7 | eligibility flip during the input debounce quotes once | fill amount `9` and flip eligibility before the 1000 ms debounce: exactly one quote for `9000000000000000000` (`forceSwapOnly=true`, preview `6`) is issued and held 1.6 s with no duplicate later quote |
| A8 | deposit reset drops the saved swap-only choice | while unavailable, real Deposit click (asserts `forceSwapOnly=false`, saved snapshot cleared) then real Withdraw click (forced `true` while unavailable), amount `3` quoted forced; eligibility -> true: `forceSwapOnly=false`, checkbox visible/enabled/unchecked and the quote re-issued with `forceSwapOnly=false` (preview `3`) — the eligible withdrawal is not forced by the stale saved preference |

Expected artifacts under `.cleanup-evidence/redemption/`:
`transcript.txt` (per-check PASS/FAIL + raw session-info envelopes), `summary.json`, `disabled-desktop-1440x900.png`,
`non-lusd-narrow-390x844.png`, `preserved-swap-only-1440x900.png`, `launch-attempted.marker`.

Closure evidence is strict: the exact-session `session info --json` envelope must parse with `success=true`, matching
namespace/session and `runtimeError=null`, then show either `browserLaunched=false`+`pageCount=0` or the explicit
absent-daemon form (`runtime=null`, `active=false`, `pid=null`); `active` alone and `session list` are never proof.

## Known limitations of this prepared proof

- There is no separate Bun unit test for the private eligibility state (the 064 exported boolean-mapping test was removed as
  not the acceptance surface); the real subscriber/DOM/route path in this driver is the coverage. Neither was executed by
  the worker.
- The fixture injects protocol settings (`isFullyCollateralized=true`) and synthetic quotes; it does not exercise real
  RPC, CoW SDK, wallet, approval or transaction paths.
- The 1000 ms amount debounce and the delayed A3/A6 status results make those the longest cases; the driver's main budget
  is 150 s and the cleanup budget 30 s.
- Rough edge (fail-closed, not weakened): the real page may still have a blocked-RPC `_loadProtocolSettings` /
  `_checkRedemptionStatus` promise in flight when the fixture is injected. The fixture overrides both services and the
  driver re-injects the synthetic protocol mode after the withdraw/LUSD interactions, but a write landing after that
  would surface as a failed bounded predicate, not a false pass.
- A6 invokes the real `_checkRedemptionStatus()` boundary through `window.__redemption.startProvisionalStatus()` (a real
  initialization boundary, not a private click handler); the delayed promise is synthetic service injection.
- If the page's selector never reaches `selected=LUSD`, the driver fails closed rather than weakening the assertion.
