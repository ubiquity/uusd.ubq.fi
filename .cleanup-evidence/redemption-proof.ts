// deno-lint-ignore-file no-explicit-any
/**
 * UUSD redemption-eligibility refresh (R1) served-UI proof for lane uusd-redemption.
 *
 * Serves this worktree's public/ on 127.0.0.1:3210 and drives the built page through the agent-browser CLI
 * (namespace uos-pr-cleanup-01a0c790, session uusd-redemption, /usr/bin/chromium, allowed domains 127.0.0.1,localhost)
 * with the synthetic services from redemption-refresh-fixture.js: real components and real DOM controls, no wallet,
 * no transaction, no signature, no approval click, no provider egress.
 *
 * Prepared by the 064 worker and NOT executed there. The exact least-permission command is in HANDBACK.txt; the bundle
 * must be rebuilt first (`deno task build`).
 *
 * Closure evidence is strict: the exact-session `session info --json` envelope must parse, carry success=true, match
 * this namespace/session, have runtimeError=null, and then either show an explicit runtime with browserLaunched=false
 * and pageCount=0 or the explicit absent-daemon form (runtime=null, active=false, pid=null). Anything else fails closed.
 */
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

const HOST = "127.0.0.1";
const PORT = 3210;
const BASE_URL = `http://${HOST}:${PORT}/`;
const ROOT = new URL("../public/", import.meta.url).pathname;
const EVIDENCE = new URL("./", import.meta.url).pathname;
const ACCEPT = `${EVIDENCE}redemption/`;
const FIXTURE = `${EVIDENCE}redemption-refresh-fixture.js`;
const CONFIG = `${EVIDENCE}agent-browser.json`;
const MARKER = `${ACCEPT}launch-attempted.marker`;
const AB = "/home/codex/.local/bin/agent-browser";
const NAMESPACE = "uos-pr-cleanup-01a0c790";
const SESSION = "uusd-redemption";
const GLOBALS = ["--namespace", NAMESPACE, "--session", SESSION, "--config", CONFIG, "--executable-path", "/usr/bin/chromium", "--allowed-domains", "127.0.0.1,localhost", "--idle-timeout", "30s"];
const CHILD_ENV = { PATH: "/home/codex/.local/bin:/usr/local/bin:/usr/bin:/bin", HOME: Deno.env.get("HOME") ?? "/home/codex", TMPDIR: Deno.env.get("TMPDIR") ?? "/tmp" };
const COMMAND_TIMEOUT_MS = 20_000;
const INTERACT_TIMEOUT_MS = 12_000;
const PAGE_TIMEOUT_MS = 20_000;
const SCREENSHOT_TIMEOUT_MS = 30_000;
const HOLD_MS = 1_500;
const MAIN_BUDGET_MS = 150_000;
const CLEANUP_BUDGET_MS = 30_000;
const LUSD = "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0";
const USDC = "0x00000000000000000000000000000000000000c2";
const AMOUNT_7 = "7000000000000000000";
const AMOUNT_9 = "9000000000000000000";

const transcript: string[] = [];
let passes = 0;
let failures = 0;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

function record(kind: string, name: string, detail: string): void {
  transcript.push(`[${kind}] ${name}${detail ? `: ${detail}` : ""}`);
}

function checkFields(name: string, observed: Record<string, any>, expected: Record<string, any>): void {
  for (const [key, want] of Object.entries(expected)) {
    const got = observed[key];
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (ok) passes += 1;
    else failures += 1;
    record(ok ? "PASS" : "FAIL", `${name}.${key}`, ok ? JSON.stringify(got) : `expected ${JSON.stringify(want)}, observed ${JSON.stringify(got)}`);
  }
}

/** Phase budget: every spawned command and every poll/hold boundary is capped by the remaining phase time. */
const phase = { label: "init", deadline: Number.POSITIVE_INFINITY };

function setBudget(label: string, ms: number): void {
  phase.label = label;
  phase.deadline = Date.now() + ms;
  record("BUDGET", label, `${ms}ms`);
}

function remainingBudgetMs(): number {
  return Math.max(0, phase.deadline - Date.now());
}

function requireBudget(where: string): number {
  const remaining = remainingBudgetMs();
  if (remaining <= 0) throw new Error(`${phase.label} budget exhausted at ${where}`);
  return remaining;
}

type SessionState = "absent" | "closed" | "live" | "invalid";

interface SessionInfo {
  state: SessionState;
  raw: string;
  reason: string;
  runtime: Record<string, any> | null;
}

/**
 * Strictly classify the exact-session `session info --json` envelope. Only an explicit closed runtime
 * (`browserLaunched === false` and `pageCount === 0`) or the explicit absent-daemon form (`runtime === null` with
 * `active === false`, `pid === null` and no `runtimeError`) counts as closure evidence; `active` alone and
 * `session list` are never used as proof.
 */
function classifySessionInfo(raw: string): SessionInfo {
  const invalid = (reason: string): SessionInfo => ({ state: "invalid", raw, reason, runtime: null });
  let envelope: Record<string, any> | null = null;
  for (let index = raw.indexOf("{"); index >= 0 && envelope === null; index = raw.indexOf("{", index + 1)) {
    try {
      const parsed = JSON.parse(raw.slice(index));
      if (parsed && typeof parsed === "object" && typeof parsed.success === "boolean" && parsed.data && typeof parsed.data === "object") envelope = parsed as Record<string, any>;
    } catch {
      // keep scanning for the full envelope
    }
  }
  if (!envelope) return invalid("no parseable session-info envelope");
  if (envelope.success !== true) return invalid(`success=${JSON.stringify(envelope.success)}`);
  const data = envelope.data as Record<string, any>;
  if (data.namespace !== NAMESPACE || data.session !== SESSION) {
    return invalid(`identity mismatch namespace=${JSON.stringify(data.namespace)} session=${JSON.stringify(data.session)}`);
  }
  if (!("runtimeError" in data) || data.runtimeError !== null) return invalid(`runtimeError=${JSON.stringify(data.runtimeError)}`);
  if (!("runtime" in data)) return invalid("runtime field missing");
  if (data.runtime === null) {
    if (data.active === false && data.pid === null) return { state: "absent", raw, reason: "explicit absent daemon (runtime=null, active=false, pid=null)", runtime: null };
    return invalid(`absent runtime without explicit active=false/pid=null (active=${JSON.stringify(data.active)} pid=${JSON.stringify(data.pid)})`);
  }
  if (typeof data.runtime !== "object") return invalid(`runtime is ${typeof data.runtime}`);
  const runtime = data.runtime as Record<string, any>;
  if (typeof runtime.browserLaunched !== "boolean" || typeof runtime.pageCount !== "number") {
    return invalid(`runtime lacks boolean browserLaunched / numeric pageCount: ${JSON.stringify(runtime)}`);
  }
  return runtime.browserLaunched === true || runtime.pageCount > 0
    ? { state: "live", raw, reason: `browserLaunched=${runtime.browserLaunched} pageCount=${runtime.pageCount}`, runtime }
    : { state: "closed", raw, reason: "browserLaunched=false pageCount=0", runtime };
}

async function readSessionInfo(): Promise<SessionInfo> {
  try {
    const raw = (await runAb(["session", "info", "--json"], { timeoutMs: INTERACT_TIMEOUT_MS })).trim();
    return classifySessionInfo(raw);
  } catch (error) {
    return { state: "invalid", raw: `CLI error: ${message(error)}`, reason: message(error), runtime: null };
  }
}

async function runAb(args: string[], options: { stdin?: string; timeoutMs?: number } = {}): Promise<string> {
  const timeoutMs = Math.min(options.timeoutMs ?? COMMAND_TIMEOUT_MS, requireBudget(args.join(" ")));
  const child = new Deno.Command(AB, {
    args: [...GLOBALS, ...args],
    stdin: options.stdin === undefined ? "null" : "piped",
    stdout: "piped",
    stderr: "piped",
    clearEnv: true,
    env: CHILD_ENV,
  }).spawn();
  const stdoutText = new Response(child.stdout).text();
  const stderrText = new Response(child.stderr).text();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      child.kill("SIGKILL");
    } catch {
      // already exited
    }
  }, timeoutMs);
  try {
    if (options.stdin !== undefined) {
      const writer = child.stdin.getWriter();
      await writer.write(new TextEncoder().encode(options.stdin));
      await writer.close();
    }
    const status = await child.status;
    const stdout = await stdoutText;
    const stderr = await stderrText;
    record("CLI", args.join(" "), timedOut ? `timeout>${timeoutMs}ms` : `exit=${status.code}`);
    if (timedOut) throw new Error(`agent-browser ${args.join(" ")} exceeded ${timeoutMs}ms`);
    if (status.code !== 0) throw new Error(`agent-browser ${args.join(" ")} exit=${status.code}: ${(stderr || stdout).trim().slice(0, 300)}`);
    return stdout;
  } catch (error) {
    await Promise.allSettled([stdoutText, stderrText]);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Evaluate one expression in the page and decode its base64 proof payload. */
async function evalPage(expression: string, timeoutMs = COMMAND_TIMEOUT_MS): Promise<any> {
  const script = `(async () => {
    const encode = (text) => { const bytes = new TextEncoder().encode(text); let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); };
    const serialize = (value) => JSON.stringify(value, (key, item) => (typeof item === "bigint" ? item.toString() : item)) ?? "null";
    try { return "__PROOF__" + encode(serialize(await (${expression}))) + "__END__"; }
    catch (error) { return "__PROOF__" + encode("ERR:" + ((error && error.message) || String(error))) + "__END__"; }
  })()`;
  const output = await runAb(["eval", "--stdin"], { stdin: script, timeoutMs });
  const match = output.match(/__PROOF__([A-Za-z0-9+/=]+)__END__/);
  if (!match) throw new Error(`page eval produced no proof payload: ${output.trim().slice(0, 300)}`);
  const text = new TextDecoder().decode(Uint8Array.from(atob(match[1]), (char) => char.charCodeAt(0)));
  if (text.startsWith("ERR:")) throw new Error(`page eval failed: ${text.slice(4)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`page eval returned a non-JSON payload (response contract broken): ${text.slice(0, 200)}`);
  }
}

const observe = () => evalPage("window.__redemption.observe()") as Promise<Record<string, any>>;

/** Two animation frames, so the component's own requestAnimationFrame listener wiring has run before interaction. */
async function settle(): Promise<void> {
  const frames = await evalPage(
    "new Promise((resolve) => { const done = () => resolve('frames'); requestAnimationFrame(() => requestAnimationFrame(done)); setTimeout(() => resolve('timeout'), 2000); })"
  );
  if (frames !== "frames") throw new Error("requestAnimationFrame did not settle within 2000ms; headless rendering may be throttled");
}

/** Bounded readiness after a synthetic payload: wait until the real DOM reflects it, then settle frames. */
async function waitFor(name: string, predicate: (observed: Record<string, any>) => boolean): Promise<void> {
  await poll(name, "window.__redemption.observe()", predicate);
  await settle();
}

async function expect(name: string, expected: Record<string, any>): Promise<void> {
  checkFields(name, await observe(), expected);
}

async function poll(name: string, expression: string, predicate: (value: any) => boolean, timeoutMs = PAGE_TIMEOUT_MS): Promise<any> {
  requireBudget(name);
  const deadline = Math.min(Date.now() + timeoutMs, phase.deadline);
  for (;;) {
    const value = await evalPage(expression);
    if (predicate(value)) return value;
    if (Date.now() >= deadline) throw new Error(`${name}: bounded predicate not met within ${timeoutMs}ms (last=${JSON.stringify(value).slice(0, 200)})`);
    await sleep(100);
  }
}

/** Bounded negative invariant: the predicate must keep holding for `ms`, and the phase budget must allow it. */
async function hold(name: string, expression: string, predicate: (value: any) => boolean, ms: number): Promise<void> {
  requireBudget(name);
  const deadline = Date.now() + ms;
  if (deadline > phase.deadline) {
    failures += 1;
    record("FAIL", name, `insufficient ${phase.label} budget to hold ${ms}ms`);
    return;
  }
  let last: Record<string, any> = {};
  do {
    last = await evalPage(expression);
    if (!predicate(last)) {
      failures += 1;
      record("FAIL", name, `invariant broken: ${JSON.stringify(last).slice(0, 240)}`);
      return;
    }
    await sleep(150);
  } while (Date.now() < deadline);
  passes += 1;
  record("PASS", name, `held ${ms}ms (amount='${last.amount}' preview='${last.previewVisible}' calls=${last.quoteCallCount})`);
}

async function runCases(fixture: string): Promise<void> {
  await runAb(["open", BASE_URL], { timeoutMs: SCREENSHOT_TIMEOUT_MS });
  await poll("app-ready", "!!(window.app && window.app._inventoryBarComponent && window.app._simplifiedExchangeComponent)", (value) => value === true);
  await runAb(["eval", "--stdin"], { stdin: fixture, timeoutMs: INTERACT_TIMEOUT_MS });
  if (!(await evalPage("typeof window.__redemption?.observe === 'function'"))) throw new Error("fixture installation failed");
  record("SETUP", "url", (await runAb(["get", "url"])).trim());
  record("EVIDENCE", "snapshot#input", (await runAb(["snapshot", "-i", "-s", "#input"])).trim().split("\n").slice(0, 20).join(" | "));

  // Setup: wallet balances, real readiness, real withdraw click, manual amount on the real input. Protocol settings
  // are injected after the interactions so a late real `_loadProtocolSettings` write cannot overwrite the synthetic
  // mode. The first click must wait for init: `mintingDisabled=false` is set in _updateFromCentralizedData, the same
  // synchronous block that reaches _setupEventListeners, and `selected=LUSD` proves the selector is initialized;
  // settle's two frames then guarantee the rAF-scheduled click listeners are actually wired before any interaction.
  await evalPage(`window.__redemption.load("p1")`);
  await poll(
    "setup.ready",
    "({ selected: window.__redemption.observe().selected, mintingDisabled: window.app._simplifiedExchangeComponent._state.mintingDisabled })",
    (value) => value.selected === "LUSD" && value.mintingDisabled === false
  );
  await settle();
  await runAb(["click", "#withdrawButton"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await waitFor("setup.withdraw", (observed) => observed.direction === "withdraw" && observed.selected === "LUSD");
  await runAb(["select", "#tokenSelect", LUSD], { timeoutMs: INTERACT_TIMEOUT_MS });
  await evalPage(`window.__redemption.setProtocolMode({ fully: true, fractional: false })`);
  await evalPage(`window.__redemption.setQuoteMode({ defaultOutput: 5000000000000000000n, defaultDelayMs: 0, hold: false, byAmount: {}, queue: {} })`);
  await runAb(["fill", "#exchangeAmount", "5"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await poll("setup.quote", "window.__redemption.observe()", (observed) => observed.previewVisible === "5" && observed.lastQuote?.forceSwapOnly === false);
  await expect("setup", {
    direction: "withdraw",
    selected: "LUSD",
    amount: "5",
    redemptionsDisabled: false,
    forceSwapOnly: false,
    swapOnlyDisplay: "block",
    swapOnlyDisabled: false,
    swapOnlyChecked: false,
    previewVisible: "5",
    quoteCallCount: 1,
    sentinel: "uusd-redemption-no-reload",
  });
  const baseline = await observe();

  // A1a: the real refresh subscription flips eligibility true -> false: protocol selection becomes Curve swap-only,
  // the swap-only control is hidden/disabled, the manual amount and LUSD output token survive, and no reload happens.
  await evalPage(`window.__redemption.setQuoteMode({ defaultOutput: 4900000000000000000n })`);
  await evalPage(`window.__redemption.emit({ isRedeemingAllowed: false })`);
  await poll("A1a.recalc", "window.__redemption.observe()", (observed) => observed.previewVisible === "4.9" && observed.lastQuote?.forceSwapOnly === true);
  await expect("A1a", {
    redemptionsDisabled: true,
    forceSwapOnly: true,
    swapOnlyDisplay: "none",
    swapOnlyDisabled: true,
    swapOnlyChecked: true,
    amount: "5",
    selected: "LUSD",
    previewVisible: "4.9",
    sentinel: "uusd-redemption-no-reload",
    installedAt: baseline.installedAt,
  });
  await runAb(["set", "viewport", "1440", "900"]);
  await runAb(["screenshot", `${ACCEPT}disabled-desktop-1440x900.png`], { timeoutMs: SCREENSHOT_TIMEOUT_MS });

  // A1b: eligibility false -> true again, still without reload: the protocol/Curve choice returns and the manual
  // amount and LUSD output token are unchanged.
  await evalPage(`window.__redemption.setQuoteMode({ defaultOutput: 5000000000000000000n })`);
  await evalPage(`window.__redemption.emit({ isRedeemingAllowed: true })`);
  await poll("A1b.recalc", "window.__redemption.observe()", (observed) => observed.previewVisible === "5" && observed.lastQuote?.forceSwapOnly === false);
  await expect("A1b", {
    redemptionsDisabled: false,
    forceSwapOnly: false,
    swapOnlyDisplay: "block",
    swapOnlyDisabled: false,
    swapOnlyChecked: false,
    amount: "5",
    selected: "LUSD",
    previewVisible: "5",
    sentinel: "uusd-redemption-no-reload",
    installedAt: baseline.installedAt,
  });

  // A2: a refresh that does not change eligibility starts no quote and resets neither the manual amount nor the output.
  const beforeUnrelated = await observe();
  await evalPage(`window.__redemption.emit({ isRedeemingAllowed: true, twapPrice: 999999n, uusdPrice: "0.999999", mintThreshold: 1000001n })`);
  await expect("A2", {
    amount: "5",
    selected: "LUSD",
    previewVisible: "5",
    redemptionsDisabled: false,
    forceSwapOnly: false,
    quoteCallCount: beforeUnrelated.quoteCallCount,
  });
  await hold(
    "A2.no-reset",
    "window.__redemption.observe()",
    (observed) => observed.amount === "5" && observed.selected === "LUSD" && observed.previewVisible === "5" && observed.quoteCallCount === beforeUnrelated.quoteCallCount,
    HOLD_MS
  );

  // A3: an older protocol quote that resolves after the eligibility transition cannot win. The first quote for
  // amount 7 is delayed (forceSwap=false, output 111); the transition starts an immediate Curve-only quote
  // (forceSwap=true, output 222), and the late 111 must not overwrite it.
  await evalPage(
    `window.__redemption.setQuoteMode({ defaultDelayMs: 0, byAmount: {}, queue: { "${AMOUNT_7}": [{ delayMs: 3000, output: 111000000000000000000n }, { delayMs: 0, output: 222000000000000000000n }] } })`
  );
  const beforeStale = await observe();
  await runAb(["fill", "#exchangeAmount", "7"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await poll(
    "A3.old-started",
    "window.__redemption.observe()",
    (observed) => observed.amount === "7" && observed.pending === 1 && observed.lastQuote?.amount === AMOUNT_7 && observed.lastQuote?.forceSwapOnly === false
  );
  await evalPage(`window.__redemption.emit({ isRedeemingAllowed: false })`);
  await poll("A3.new-visible", "window.__redemption.observe()", (observed) => observed.previewVisible === "222" && observed.lastQuote?.forceSwapOnly === true);
  await expect("A3.transition", {
    amount: "7",
    selected: "LUSD",
    previewVisible: "222",
    redemptionsDisabled: true,
    forceSwapOnly: true,
    pending: 1,
    quoteCallCount: beforeStale.quoteCallCount + 2,
  });
  const staleFlags = await evalPage(`window.__redemption.quoteLog("${AMOUNT_7}")`);
  checkFields("A3.force-flags", { flags: staleFlags }, { flags: [false, true] });
  await poll("A3.stale-resolved", "window.__redemption.observe()", (observed) => observed.pending === 0 && observed.resolved === beforeStale.resolved + 2);
  await expect("A3.after-old-resolved", { amount: "7", selected: "LUSD", previewVisible: "222", outputVisible: true, redemptionsDisabled: true, forceSwapOnly: true });

  // A4: a non-LUSD CoW withdrawal output keeps its own route through the transition and is never silently
  // switched to LUSD.
  await runAb(["select", "#tokenSelect", USDC], { timeoutMs: INTERACT_TIMEOUT_MS });
  await poll("A4.cow-quote", "window.__redemption.observe()", (observed) => observed.selected === "USDC" && observed.previewVisible === "333" && observed.cowCalls === 1);
  const beforeCowTransition = await observe();
  await expect("A4.selected", { amount: "7", selected: "USDC", previewVisible: "333", cowCalls: 1, lastCow: { outputSymbol: "USDC", amount: AMOUNT_7 } });
  await evalPage(`window.__redemption.emit({ isRedeemingAllowed: true })`);
  await expect("A4.after-transition", {
    amount: "7",
    selected: "USDC",
    previewVisible: "333",
    cowCalls: 1,
    quoteCallCount: beforeCowTransition.quoteCallCount,
    redemptionsDisabled: false,
    forceSwapOnly: false,
  });
  await hold(
    "A4.no-silent-lusd",
    "window.__redemption.observe()",
    (observed) => observed.selected === "USDC" && observed.previewVisible === "333" && observed.cowCalls === 1 && observed.quoteCallCount === beforeCowTransition.quoteCallCount,
    HOLD_MS
  );
  await runAb(["set", "viewport", "390", "844"]);
  await runAb(["screenshot", `${ACCEPT}non-lusd-narrow-390x844.png`], { timeoutMs: SCREENSHOT_TIMEOUT_MS });

  // A5: a real user swap-only checkbox choice survives an unavailable interval (true -> false -> true) at full
  // collateralization; the forced interval must not erase it.
  await runAb(["set", "viewport", "1440", "900"]);
  await evalPage(`window.__redemption.setQuoteMode({ defaultOutput: 5000000000000000000n, defaultDelayMs: 0, hold: false, byAmount: {}, queue: {} })`);
  await runAb(["select", "#tokenSelect", LUSD], { timeoutMs: INTERACT_TIMEOUT_MS });
  await poll("A5.baseline-quote", "window.__redemption.observe()", (observed) => observed.selected === "LUSD" && observed.previewVisible === "5" && observed.lastQuote?.forceSwapOnly === false);
  await expect("A5.baseline", {
    amount: "7",
    selected: "LUSD",
    redemptionsDisabled: false,
    forceSwapOnly: false,
    swapOnlyDisplay: "block",
    swapOnlyDisabled: false,
    swapOnlyChecked: false,
    previewVisible: "5",
  });
  await evalPage(`window.__redemption.setQuoteMode({ defaultOutput: 4800000000000000000n })`);
  await runAb(["click", "#forceSwapOnly"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await poll(
    "A5.user-choice-quote",
    "window.__redemption.observe()",
    (observed) => observed.forceSwapOnly === true && observed.swapOnlyChecked === true && observed.previewVisible === "4.8" && observed.lastQuote?.forceSwapOnly === true
  );
  await expect("A5.user-choice", {
    amount: "7",
    selected: "LUSD",
    redemptionsDisabled: false,
    forceSwapOnly: true,
    swapOnlyChecked: true,
    swapOnlyDisabled: false,
    previewVisible: "4.8",
  });
  await evalPage(`window.__redemption.emit({ isRedeemingAllowed: false })`);
  await poll(
    "A5.unavailable",
    "window.__redemption.observe()",
    (observed) => observed.redemptionsDisabled === true && observed.swapOnlyDisplay === "none" && observed.swapOnlyDisabled === true && observed.lastQuote?.forceSwapOnly === true
  );
  await expect("A5.forced", {
    amount: "7",
    selected: "LUSD",
    redemptionsDisabled: true,
    forceSwapOnly: true,
    swapOnlyDisplay: "none",
    swapOnlyDisabled: true,
    swapOnlyChecked: true,
    previewVisible: "4.8",
  });
  await evalPage(`window.__redemption.emit({ isRedeemingAllowed: true })`);
  await poll(
    "A5.restored",
    "window.__redemption.observe()",
    (observed) =>
      observed.redemptionsDisabled === false &&
      observed.forceSwapOnly === true &&
      observed.swapOnlyDisplay === "block" &&
      observed.swapOnlyDisabled === false &&
      observed.swapOnlyChecked === true &&
      observed.lastQuote?.forceSwapOnly === true
  );
  await expect("A5.preserved", {
    amount: "7",
    selected: "LUSD",
    redemptionsDisabled: false,
    forceSwapOnly: true,
    swapOnlyDisplay: "block",
    swapOnlyDisabled: false,
    swapOnlyChecked: true,
    previewVisible: "4.8",
    sentinel: "uusd-redemption-no-reload",
  });
  await runAb(["screenshot", `${ACCEPT}preserved-swap-only-1440x900.png`], { timeoutMs: SCREENSHOT_TIMEOUT_MS });

  // A6: a delayed provisional startup status (success and rejection) cannot overwrite newer refresh eligibility.
  const beforeProvisional = await observe();
  await evalPage(`window.__redemption.setStatusResult({ delayMs: 1200, isRedeemingAllowed: false })`);
  await evalPage(`window.__redemption.startProvisionalStatus()`);
  await evalPage(`window.__redemption.emit({ isRedeemingAllowed: true })`);
  await poll("A6.delayed-success-settled", "window.__redemption.observe()", (observed) => observed.statusSettled === true);
  await expect("A6.delayed-success", {
    redemptionsDisabled: false,
    forceSwapOnly: true,
    swapOnlyChecked: true,
    amount: "7",
    selected: "LUSD",
    quoteCallCount: beforeProvisional.quoteCallCount,
    installedAt: beforeProvisional.installedAt,
  });
  await evalPage(`window.__redemption.setStatusReject({ delayMs: 900 })`);
  await evalPage(`window.__redemption.startProvisionalStatus()`);
  await evalPage(`window.__redemption.emit({ isRedeemingAllowed: true, twapPrice: 999999n })`);
  await poll("A6.delayed-reject-settled", "window.__redemption.observe()", (observed) => observed.statusSettled === true);
  await expect("A6.delayed-reject", {
    redemptionsDisabled: false,
    forceSwapOnly: true,
    swapOnlyChecked: true,
    amount: "7",
    selected: "LUSD",
    quoteCallCount: beforeProvisional.quoteCallCount,
  });

  // A7: an eligibility flip during the input debounce cancels that debounce and quotes the current amount once.
  await evalPage(`window.__redemption.setQuoteMode({ defaultOutput: 6000000000000000000n, defaultDelayMs: 0, hold: false, byAmount: {}, queue: {} })`);
  const beforeDebounce = await observe();
  await runAb(["fill", "#exchangeAmount", "9"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await evalPage(`window.__redemption.emit({ isRedeemingAllowed: false })`);
  await poll(
    "A7.single-quote",
    "window.__redemption.observe()",
    (observed) => observed.amount === "9" && observed.lastQuote?.amount === AMOUNT_9 && observed.previewVisible === "6" && observed.redemptionsDisabled === true
  );
  await expect("A7.immediate", {
    amount: "9",
    selected: "LUSD",
    redemptionsDisabled: true,
    forceSwapOnly: true,
    quoteCallCount: beforeDebounce.quoteCallCount + 1,
    pending: 0,
  });
  const debounceFlags = await evalPage(`window.__redemption.quoteLog("${AMOUNT_9}")`);
  checkFields("A7.force-flags", { flags: debounceFlags }, { flags: [true] });
  await hold(
    "A7.no-duplicate",
    "window.__redemption.observe()",
    (observed) => observed.amount === "9" && observed.previewVisible === "6" && observed.quoteCallCount === beforeDebounce.quoteCallCount + 1,
    1_600
  );

  // A8: the existing deposit-direction reset also drops the saved swap-only choice, so an eligible return after
  // Withdraw -> Deposit -> Withdraw (still unavailable) is not forced by the stale preference. Full
  // collateralization keeps the fractional acceptFractionalRedemption policy out of the way.
  await evalPage(`window.__redemption.setQuoteMode({ defaultOutput: 3000000000000000000n, defaultDelayMs: 0, hold: false, byAmount: {}, queue: {} })`);
  await runAb(["click", "#depositButton"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await waitFor("A8.deposit", (observed) => observed.direction === "deposit");
  await expect("A8.deposit-reset", { redemptionsDisabled: true, forceSwapOnly: false });
  await runAb(["click", "#withdrawButton"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await waitFor("A8.withdraw", (observed) => observed.direction === "withdraw" && observed.selected === "LUSD");
  await expect("A8.still-unavailable", { redemptionsDisabled: true, forceSwapOnly: true, swapOnlyDisplay: "none" });
  await runAb(["fill", "#exchangeAmount", "3"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await poll(
    "A8.forced-quote",
    "window.__redemption.observe()",
    (observed) => observed.amount === "3" && observed.previewVisible === "3" && observed.lastQuote?.forceSwapOnly === true
  );
  await evalPage(`window.__redemption.emit({ isRedeemingAllowed: true })`);
  await poll(
    "A8.eligible-return",
    "window.__redemption.observe()",
    (observed) =>
      observed.redemptionsDisabled === false &&
      observed.forceSwapOnly === false &&
      observed.swapOnlyDisplay === "block" &&
      observed.swapOnlyDisabled === false &&
      observed.swapOnlyChecked === false &&
      observed.lastQuote?.forceSwapOnly === false
  );
  await expect("A8.not-forced", {
    direction: "withdraw",
    amount: "3",
    selected: "LUSD",
    redemptionsDisabled: false,
    forceSwapOnly: false,
    swapOnlyDisplay: "block",
    swapOnlyDisabled: false,
    swapOnlyChecked: false,
    previewVisible: "3",
  });
}

async function writeOutputs(cleanupErrors: string[] = []): Promise<void> {
  transcript.push(`[SUMMARY] passes=${passes} failures=${failures} cleanupErrors=${cleanupErrors.length} namespace=${NAMESPACE} session=${SESSION} finishedAt=${new Date().toISOString()}`);
  await Deno.writeTextFile(`${ACCEPT}transcript.txt`, `${transcript.join("\n")}\n`);
  await Deno.writeTextFile(`${ACCEPT}summary.json`, `${JSON.stringify({ passes, failures, cleanupErrors, namespace: NAMESPACE, session: SESSION, finishedAt: new Date().toISOString() }, null, 2)}\n`);
}

async function main(): Promise<void> {
  setBudget("main", MAIN_BUDGET_MS);
  await Deno.mkdir(ACCEPT, { recursive: true });
  const configText = await Deno.readTextFile(CONFIG).catch(() => "");
  if (configText.trim() !== "{}") throw new Error(`${CONFIG} must exist and contain only {} (task-only browser config)`);
  const fixture = await Deno.readTextFile(FIXTURE);
  if (!fixture.includes("window.__redemption")) throw new Error(`${FIXTURE} does not install window.__redemption`);
  const bundle = await Deno.readTextFile(`${ROOT}app.js`).catch(() => "");
  if (!bundle.includes("Redemption eligibility changed")) throw new Error(`${ROOT}app.js is stale: it lacks the redemption-eligibility refresh, run \`deno task build\` first`);

  const preflight = await readSessionInfo();
  record("PRECHECK", "session-info-raw", preflight.raw);
  record("PRECHECK", "session-state", `${preflight.state} (${preflight.reason})`);
  if (preflight.state === "invalid") {
    record("REFUSE", "session-info", preflight.reason);
    await writeOutputs();
    throw new Error(`cannot verify ${NAMESPACE}/${SESSION} session state (${preflight.reason}); refusing to launch`);
  }
  if (preflight.state === "live") {
    record("REFUSE", "live-browser", preflight.reason);
    await writeOutputs();
    throw new Error(`a browser is already live in ${NAMESPACE}/${SESSION} (${preflight.reason}); refusing to take it (nothing closed)`);
  }

  try {
    const probe = Deno.listen({ hostname: HOST, port: PORT });
    probe.close();
  } catch (error) {
    record("REFUSE", "port", `${HOST}:${PORT} unavailable (${message(error)}); owner left untouched`);
    await writeOutputs();
    throw error;
  }

  const server = Deno.serve({ hostname: HOST, port: PORT }, (request) => serveDir(request, { fsRoot: ROOT, quiet: true }));
  record("SETUP", "server", `${BASE_URL} from ${ROOT}`);
  const cleanupErrors: string[] = [];
  let launchAttempted = false;
  let mainError: unknown = null;
  try {
    launchAttempted = true;
    await Deno.writeTextFile(MARKER, `${new Date().toISOString()}\n`);
    await runCases(fixture);
  } catch (error) {
    mainError = error;
  } finally {
    // Cleanup gets its own bounded budget, so a main-budget overrun cannot block or extend it.
    setBudget("cleanup", CLEANUP_BUDGET_MS);
    if (launchAttempted) {
      try {
        await runAb(["close"], { timeoutMs: INTERACT_TIMEOUT_MS });
      } catch (error) {
        cleanupErrors.push(`close: ${message(error)}`);
      }
      try {
        let info = await readSessionInfo();
        record("CLEANUP", "session-info-raw", info.raw);
        if (info.state === "live") {
          await runAb(["close"], { timeoutMs: INTERACT_TIMEOUT_MS });
          info = await readSessionInfo();
          record("CLEANUP", "session-info-raw-retry", info.raw);
        }
        if (info.state === "closed") record("CLEANUP", "browser-closed", info.reason);
        else if (info.state === "absent") record("CLEANUP", "browser-absent", info.reason);
        else cleanupErrors.push(`closure not proven in ${NAMESPACE}/${SESSION}: state=${info.state} reason=${info.reason} raw=${info.raw.slice(0, 400)}`);
      } catch (error) {
        cleanupErrors.push(`verify: ${message(error)}`);
      }
    }
    try {
      await server.shutdown();
      let released = false;
      for (let attempt = 0; attempt < 10 && !released && remainingBudgetMs() > 0; attempt += 1) {
        try {
          const probe = Deno.listen({ hostname: HOST, port: PORT });
          probe.close();
          released = true;
        } catch {
          await sleep(200);
        }
      }
      if (!released) throw new Error(`listener still bound on ${HOST}:${PORT}${remainingBudgetMs() <= 0 ? " (cleanup budget exhausted)" : ""}`);
      record("CLEANUP", "port-released", `${HOST}:${PORT}`);
    } catch (error) {
      cleanupErrors.push(`server: ${message(error)}`);
    }
    await writeOutputs(cleanupErrors);
  }

  if (mainError) throw new Error(`${message(mainError)}${cleanupErrors.length ? ` | cleanup errors: ${cleanupErrors.join("; ")}` : ""}`);
  if (failures > 0) throw new Error(`${failures} assertion(s) failed${cleanupErrors.length ? ` | cleanup errors: ${cleanupErrors.join("; ")}` : ""}`);
  if (cleanupErrors.length) throw new Error(`cleanup errors: ${cleanupErrors.join("; ")}`);
}

if (import.meta.main) {
  await main().then(
    () => console.log(`proof passed: ${passes} checks`),
    (error) => {
      console.error(`proof failed: ${message(error)}`);
      Deno.exit(1);
    }
  );
}
