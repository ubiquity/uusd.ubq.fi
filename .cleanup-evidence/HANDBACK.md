# HANDBACK — decimals-aware minimum visible token amount (PR 66/67 extraction)

## Lane

- Worktree: `/home/codex/repos/ubiquity/uusd.ubq.fi/.codex-worktrees/plan-m-uusd-token-decimals-a6c92182a2b`
- Branch: `codex/plan-m-uusd-token-decimals-a6c92182a2b`
- Base / HEAD: `eb0386e074f1e6638cc20ed6c17d59479448b9cb` (unchanged, no commits)
- Donor: PRs #66/#67 (jspector-fr), identical head `d975634c35edae25be48082732383b75360ba1b8`, base `eb0386e074f1e6638cc20ed6c17d59479448b9cb`, diff SHA-256 prefix `cdc5e3ed330cf1d8` (frozen dispositions: `reviews/uusd.ubq.fi/dispositions.json`, `evidence/pr-66/diff.patch`).

## Changes (3 files, no others)

| File | Change |
| --- | --- |
| `src/utils/token-utils.ts` | Adds `MINIMUM_VISIBLE_TOKEN_AMOUNT = "0.0001"` + `getMinimumVisibleTokenAmount(decimals)`; replaces both `parseUnits("0.0001", decimals)` call sites (`formatTokenAmount`, `isBalanceZero`) and the `"<0.0001"` literal with `` `<${MINIMUM_VISIBLE_TOKEN_AMOUNT}` ``. |
| `src/utils/balance-utils.ts` | Reports the D2 defect fix: `getBalanceDisplay` now compares `tokenBalance.balance` against `getMinimumVisibleTokenAmount(tokenBalance.decimals)` instead of the hardcoded raw `100000000000000n`. |
| `src/utils/token-utils.test.ts` | New focused `bun:test` regression against production functions (`getMinimumVisibleTokenAmount`, `isBalanceZero`, `getBalanceDisplay`), no network, no mocks of the logic under test. |

Semantics preserved: `<` comparator (strictly below threshold is hidden), 0.0001 human-unit threshold, `"<0.0001"` display text, all 18-decimal results identical to before. No USD dust filter, Max UI, token-selector, CoW or D1 regex work. No deps, config, lockfile, env, CLI or runtime changes. No transactions/wallet/signing/approvals/network.

## parseUnits runtime review (done before the edit)

Read the exact published source of the pinned runtime dependency, both lockfile resolutions:

- `bun.lock` pins `viem@2.31.2`; `deno.lock` resolves `viem@2.48.4`. The `parseUnits` algorithm is byte-identical in both (fetched from `https://cdn.jsdelivr.net/npm/viem@2.31.2/utils/unit/parseUnits.ts` and `.../viem@2.48.4/...`).
- With 4+ decimals it pads the fraction: `parseUnits("0.0001", 6) = 100n`, `8 = 10000n`, `18 = 100000000000000n`.
- With fewer than 4 decimals it **rounds down to `0n`**, it does not throw: `parseUnits("0.0001", 2) = 0n`. A `0n` threshold would make `isBalanceZero(0n, 2)` return `false`.

Donor correction (only deviation, tiny and explained): the donor helper calls `parseUnits` unconditionally, so it mis-scales below 4 decimals. `getMinimumVisibleTokenAmount` returns `1n` (the smallest raw unit) when `decimals < 4`. This is the correct cutoff there: at 2 decimals the smallest non-zero amount is 0.01, already above 0.0001, so every non-zero balance is visible and zero stays zero. This satisfies the assignment's sub-4-decimals constraint and also repairs the pre-existing `isBalanceZero(0n, 2) === false` bug rather than propagating it from the centralized helper.

## Verification status

Not executed here, per assignment (primary relays exact commands under shared `heavy.lock`). No raw build/install/server was run; no formatter was run (prettier is not installed, `node_modules` is absent). Files were written to `.prettierrc` conventions (2-space, double quotes, semicolons, width 160).

`node_modules` is **absent** in this worktree, so install is required before the focused run. No environment variables are needed for the focused test: it uses only viem pure functions plus an in-memory `InventoryBarComponent` stub with `getBalances()`; no RPC, no `.env`, no credentials.

### Exact commands for the primary relay

```sh
# 1) install (heavy.lock; prefer frozen so bun.lock cannot mutate)
bun install --frozen-lockfile   # fall back to `bun install` only if the lockfile needs migration

# 2) focused functional proof (runtime: bun 1.4.0; repo has no test script, bun:test per .rules)
bun test src/utils/token-utils.test.ts

# 3) existing repo checks, unchanged commands
npm run typecheck   # tsc --noEmit
npm run lint        # eslint src --ext .ts (the new test is under src/ and in tsconfig include)
npm run format:check  # prettier --check 'src/**/*.ts' (single pass, existing config)
```

Optional registered evidence form (host tool path and mode per `agents/test-evidence.md`):

```sh
printf '%s\n' '{"op":"register","target":"unit","definition":{"command":["bun","test","--max-concurrency=1","src/utils/token-utils.test.ts"],"cwd":"."},"reason":"focused decimals regression for token-utils/balance-utils"}' | deno run -A "$HOME/.codex/agents/assets/test-evidence/evidence.ts"
printf '%s\n' '{"op":"run","target":"unit","mode":"capture","reason":"verify the focused decimals fix"}' | deno run -A "$HOME/.codex/agents/assets/test-evidence/evidence.ts"
```

### Minimal local functional proof (expected observable result)

`bun test src/utils/token-utils.test.ts` must report **6 pass, 0 fail** with **21 expect() calls**. The discriminating assertions (these fail on base `eb0386e0`, before the fix):

- `getBalanceDisplay(bar, "USDC")` with `1_000_000n` raw (1 USDC, 6 decimals) → `"1"`. Base returned `"<0.0001"` because `1e6 < 1e14`.
- `getBalanceDisplay(bar, "WBTC")` with `50_000_000n` raw (0.5 WBTC, 8 decimals) → `"0.5"`. Base returned `"<0.0001"` because `5e7 < 1e14`.
- `getMinimumVisibleTokenAmount(6|8|18)` → `100n | 10_000n | 100_000_000_000_000n`.
- `isBalanceZero(10_000n, 8)` → `false`. Base returned `true` because `10_000 < 1e14`.
- `isBalanceZero(0n, 2)` → `true` and `isBalanceZero(1n, 2)` → `false` (sub-4-decimal guard).
- Balance filtering with the production predicate (same expression as `src/components/inventory-bar-component.ts:422`): a mixed list `[USDC 1, WBTC 0.00009999, LUSD 0.0001]` keeps `["USDC", "LUSD"]`.
- Preservation: `isBalanceZero` stays `true` for `99n`/`9_999n`/`99_999_999_999_999n` and `false` at the 18-decimal boundary `100_000_000_000_000n`; `getBalanceDisplay` still returns `"<0.0001"` for those dust balances, and `0.0001` at 18 decimals still displays `"0.0001"`.

Static derivation from the pinned viem source (no execution): `parseUnits("0.0001", 6)` pads `"0001"` to `"000100"` → `100n`; at 8 → `"00010000"` → `10000n`; at 18 → `100000000000000n`; at 2 the fraction length exceeds 2 and the rounding path yields `0n`, which the helper replaces with `1n`.

## Concerns

- `getBalanceDisplay` still has **no call sites** in `main` (report D5), so the fixed path is latent until wired; `isBalanceZero` is live in `src/components/inventory-bar-component.ts:318` and `:422`, and `formatTokenAmount` at `:432`, so the centralized helper and the sub-4-decimal guard do affect runtime there. The proven scaling defect is fixed at every `0.0001`/`1e14` site in `src/` (grep-verified: only the constant and test literals remain).
- Pre-existing D1 (trailing-zero regex `/\.?0+$/` corrupts whole numbers, e.g. `"1000" → "1"`) is untouched by design; it is out of this module's assignment and in both `getBalanceDisplay`/`formatTokenAmount` call paths. Do not attribute its behavior to this change.
- `getBalanceDisplay` remains dead code; I did not wire it (forbidden broader work).
- Test file uses `as unknown as InventoryBarComponent` to stub only `getBalances()`; if the component interface changes, the typecheck (not the test logic) would need the stub updated.
- No commits, pushes, PRs, comments, deployments, children or background jobs were created; lane is clean apart from the 3 files above plus this handback.
