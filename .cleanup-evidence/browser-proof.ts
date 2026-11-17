// deno-lint-ignore-file no-explicit-any
/**
 * UUSD selector/Max served-UI acceptance proof for lane uusd-selector.
 *
 * Serves this worktree's public/ on 127.0.0.1:3210 and drives the built page through the agent-browser CLI
 * (namespace uos-pr-cleanup-01a0c790, session uusd-selector, /usr/bin/chromium, allowed domains 127.0.0.1,localhost)
 * with the synthetic services from acceptance-fixture.js: no wallet, no transaction, no signature, no approval click,
 * no provider egress. Run from the lane root; the exact command is in HANDBACK.md.
 *
 * Closure evidence is strict: the exact-session `session info --json` envelope must parse, carry success=true, match
 * this namespace/session, have runtimeError=null, and then either show an explicit runtime with browserLaunched=false
 * and pageCount=0 or the explicit absent-daemon form (runtime=null, active=false, pid=null). Anything else fails closed.
 * The main phase is bounded by MAIN_BUDGET_MS and cleanup by CLEANUP_BUDGET_MS at every command/poll boundary.
 */
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

const HOST = "127.0.0.1";
const PORT = 3210;
const BASE_URL = `http://${HOST}:${PORT}/`;
const ROOT = new URL("../public/", import.meta.url).pathname;
const EVIDENCE = new URL("./", import.meta.url).pathname;
const ACCEPT = `${EVIDENCE}acceptance/`;
const FIXTURE = `${EVIDENCE}acceptance-fixture.js`;
const CONFIG = `${EVIDENCE}agent-browser.json`;
const MARKER = `${ACCEPT}launch-attempted.marker`;
const AB = "/home/codex/.local/bin/agent-browser";
const NAMESPACE = "uos-pr-cleanup-01a0c790";
const SESSION = "uusd-selector";
const GLOBALS = ["--namespace", NAMESPACE, "--session", SESSION, "--config", CONFIG, "--executable-path", "/usr/bin/chromium", "--allowed-domains", "127.0.0.1,localhost", "--idle-timeout", "30s"];
const CHILD_ENV = { PATH: "/home/codex/.local/bin:/usr/local/bin:/usr/bin:/bin", HOME: Deno.env.get("HOME") ?? "/home/codex", TMPDIR: Deno.env.get("TMPDIR") ?? "/tmp" };
const COMMAND_TIMEOUT_MS = 20_000;
const INTERACT_TIMEOUT_MS = 12_000;
const PAGE_TIMEOUT_MS = 20_000;
const SCREENSHOT_TIMEOUT_MS = 30_000;
const HOLD_MS = 1_400;
const MAIN_BUDGET_MS = 150_000;
const CLEANUP_BUDGET_MS = 30_000;
const LUSD = "0x5f98805A4E8be255a32880FDeC7F6728C6568bA0";
const USDC = "0x00000000000000000000000000000000000000c2";

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
 * Strictly classify the exact-session `session info --json` envelope.
 * Only an explicit closed runtime (`browserLaunched === false` and `pageCount === 0`) or the explicit absent-daemon
 * form (`runtime === null` with `active === false`, `pid === null` and no `runtimeError`) counts as closure evidence;
 * a missing field, a different namespace/session or a parse failure is invalid and must fail closed. `active` alone and
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
    // One response contract: every successful value is JSON text (strings quoted, BigInt -> decimal string, undefined -> null).
    // Promises are awaited, so expressions may use requestAnimationFrame or timers.
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

const observe = () => evalPage("window.__proof.observe()") as Promise<Record<string, any>>;

/** Two animation frames, so the component's own requestAnimationFrame listener wiring has run before interaction. */
async function settle(): Promise<void> {
  const frames = await evalPage(
    "new Promise((resolve) => { const done = () => resolve('frames'); requestAnimationFrame(() => requestAnimationFrame(done)); setTimeout(() => resolve('timeout'), 2000); })"
  );
  if (frames !== "frames") throw new Error("requestAnimationFrame did not settle within 2000ms; headless rendering may be throttled");
}

/**
 * Bounded readiness after a synthetic payload: wait until that payload is actually rendered into the selector, then
 * settle frames. The fixture must not fake options or call component internals; this only observes the real DOM state
 * produced by the real subscription/init path.
 */
async function waitFor(name: string, predicate: (observed: Record<string, any>) => boolean): Promise<void> {
  await poll(name, "window.__proof.observe()", predicate);
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
  record("PASS", name, `held ${ms}ms (calls=${last.calls} amount='${last.amount}' outputVisible=${last.outputVisible})`);
}

async function runCases(fixture: string): Promise<void> {
  await runAb(["open", BASE_URL], { timeoutMs: SCREENSHOT_TIMEOUT_MS });
  await poll("app-ready", "!!(window.app && window.app._inventoryBarComponent)", (value) => value === true);
  await runAb(["eval", "--stdin"], { stdin: fixture, timeoutMs: INTERACT_TIMEOUT_MS });
  if (!(await evalPage("typeof window.__proof?.observe === 'function'"))) throw new Error("fixture installation failed");
  record("SETUP", "url", (await runAb(["get", "url"])).trim());
  record("EVIDENCE", "snapshot#input", (await runAb(["snapshot", "-i", "-s", "#input"])).trim().split("\n").slice(0, 20).join(" | "));

  // C1/C2 - >$1 rows, dust hidden, unpriced kept, wallet-total header
  await evalPage(`window.__proof.load("p1")`);
  await waitFor("C1.ready", (observed) => observed.your.length === 3 && observed.your.includes("USDC") && observed.your.includes("UBQ") && observed.selected !== null);
  await poll("C1.rows", "window.__proof.observe()", (observed) => observed.rows.length === 2);
  await expect("C1", { rows: ["12.5", "1,000"], your: ["LUSD", "USDC", "UBQ"], other: [], yourDisplay: "", otherDisplay: "none", label: "Amount (LUSD)", selected: "LUSD" });
  await expect("C2", { total: "$1,013.00" });
  await runAb(["set", "viewport", "1440", "900"]);
  await runAb(["screenshot", `${ACCEPT}desktop-1440x900.png`], { timeoutMs: SCREENSHOT_TIMEOUT_MS });
  await runAb(["set", "viewport", "390", "844"]);
  await runAb(["screenshot", `${ACCEPT}narrow-390x844.png`], { timeoutMs: SCREENSHOT_TIMEOUT_MS });
  record("EVIDENCE", "screenshots", "desktop-1440x900.png, narrow-390x844.png");

  // C3 - dust LUSD stays offered; Max uses the exact dust balance
  await evalPage(`window.__proof.load("p3")`);
  await waitFor("C3.ready", (observed) => observed.your.length === 2 && observed.your.includes("LUSD") && observed.your.includes("USDC"));
  await runAb(["select", "#tokenSelect", LUSD], { timeoutMs: INTERACT_TIMEOUT_MS });
  await expect("C3", { your: ["LUSD", "USDC"], label: "Amount (LUSD)", selected: "LUSD", maxDisabled: false });
  await runAb(["click", "#maxButton"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await expect("C3.max", { amount: "0.05" });

  // C4 - no eligible holdings -> preloaded list only
  await evalPage(`window.__proof.load("p4")`);
  await waitFor("C4.ready", (observed) => observed.optionCount === 343 && observed.yourDisplay === "none");
  await expect("C4", { yourDisplay: "none", your: [], otherDisplay: "", firstOption: "LUSD", optionCount: 343 });

  // C5/C6 - 1000 USDC Max is exact (D1); the quote recalcs; a background update cannot overwrite it
  await evalPage(`window.__proof.load("p1")`);
  await waitFor("C5.ready", (observed) => observed.your.length === 3 && observed.your.includes("USDC") && observed.selected !== null);
  await runAb(["select", "#tokenSelect", USDC], { timeoutMs: INTERACT_TIMEOUT_MS });
  await expect("C5.enabled", { selected: "USDC", maxDisabled: false, amount: "" });
  await runAb(["click", "#maxButton"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await expect("C5", { amount: "1000" });
  await evalPage(`window.__proof.load("p1")`);
  await waitFor("C5.refresh-ready", (observed) => observed.rows.length === 2 && observed.rows.includes("12.5") && observed.selected === "USDC");
  await expect("C5.after-refresh", { amount: "1000", selected: "USDC" });
  await poll("C6", "window.__proof.observe()", (observed) => observed.previewVisible === "990" && observed.buttonText === "Approve USDC");
  await expect("C6", { previewVisible: "990", buttonText: "Approve USDC" });

  // D1 correction - Max renders the cleared output before its own deliberately delayed quote resolves
  await evalPage(`window.__proof.setMode({ defaultDelayMs: 0, defaultOutput: 990000000000000000000n, hold: false, byAmount: {} })`);
  await poll("D1.pre", "window.__proof.observe()", (observed) => observed.previewVisible === "990");
  const d1Calls = (await observe()).calls;
  await evalPage(`window.__proof.setMode({ defaultOutput: 777000000000000000000n, defaultDelayMs: 2000 })`);
  await runAb(["click", "#maxButton"], { timeoutMs: INTERACT_TIMEOUT_MS });
  const d1Pending = await poll("D1.pending", "window.__proof.observe()", (observed) => observed.pending >= 1 && observed.previewVisible !== "777");
  checkFields("D1.pending", d1Pending, { outputVisible: false, buttonDisabled: true, buttonText: "Enter amount to continue", previewVisible: null, amount: "1000", calls: d1Calls + 1 });
  await poll("D1.resolved", "window.__proof.observe()", (observed) => observed.previewVisible === "777");
  await expect("D1.after", { previewVisible: "777", outputVisible: true });

  // C7 - a manual amount is not overwritten by a background balance update
  await evalPage(`window.__proof.setMode({ defaultOutput: 990000000000000000000n, defaultDelayMs: 0, hold: false, byAmount: {} })`);
  await runAb(["fill", "#exchangeAmount", "2"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await poll("C7.quote", "window.__proof.observe()", (observed) => observed.previewVisible === "990" && observed.lastCall?.amount === "2000000");
  await evalPage(`window.__proof.load("p1")`);
  await waitFor("C7.ready", (observed) => observed.rows.length === 2 && observed.rows.includes("12.5") && observed.selected === "USDC");
  await expect("C7", { amount: "2", previewVisible: "990", selected: "USDC" });

  // C8 - an older quote resolving after a newer one cannot overwrite the newer amount
  await evalPage(`window.__proof.setMode({ defaultDelayMs: 0, defaultOutput: 990000000000000000000n, hold: false, byAmount: { "1000000": { delayMs: 4000, output: 111n }, "2000000": { delayMs: 0, output: 1980000000000000000n } } })`);
  const c8 = await observe();
  await runAb(["fill", "#exchangeAmount", "1"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await poll("C8.old-started", "window.__proof.observe()", (observed) => observed.calls === c8.calls + 1 && observed.pending === 1);
  await runAb(["fill", "#exchangeAmount", "2"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await poll("C8.new-visible", "window.__proof.observe()", (observed) => observed.previewVisible === "1.98");
  await expect("C8.new", { amount: "2", previewVisible: "1.98", pending: 1 });
  await poll("C8.old-resolved", "window.__proof.observe()", (observed) => observed.pending === 0 && observed.resolved === c8.resolved + 2);
  await expect("C8.after-old-resolved", { amount: "2", previewVisible: "1.98", calls: c8.calls + 2 });

  // R1 - explicit Max with no balance clears the input, cancels the pending debounce and quotes nothing new
  await evalPage(`window.__proof.load("p1")`);
  await waitFor("R1.ready", (observed) => observed.rows.length === 2 && observed.rows.includes("12.5") && observed.selected === "USDC");
  await runAb(["select", "#tokenSelect", USDC], { timeoutMs: INTERACT_TIMEOUT_MS });
  await evalPage(`window.__proof.setMode({ hold: true, defaultDelayMs: 0, defaultOutput: 990000000000000000000n, byAmount: {} })`);
  await runAb(["fill", "#exchangeAmount", "5"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await expect("R1.enabled", { maxDisabled: false, amount: "5" });
  await evalPage(`window.__proof.dropBalance("${USDC}")`);
  const clickAt = await evalPage("Date.now()");
  await runAb(["click", "#maxButton"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await expect("R1.cleared", { amount: "", outputVisible: false, buttonDisabled: true, previewVisible: null });
  await hold("R1.no-late-quote", "window.__proof.observe()", (observed) => observed.amount === "" && observed.outputVisible === false && observed.buttonDisabled === true && observed.callLog.every((call: any) => call.at <= clickAt), HOLD_MS);
  await evalPage(`window.__proof.setMode({ hold: false, defaultDelayMs: 0, defaultOutput: 990000000000000000000n, byAmount: {} })`);

  // C9-C12 - disabled states and native select readability
  await evalPage(`window.__proof.load("p1")`);
  await waitFor("C9.ready", (observed) => observed.rows.length === 2 && observed.rows.includes("12.5") && observed.selected !== null);
  await evalPage(`window.__proof.setConnected(false)`);
  await evalPage(`window.__proof.render()`);
  await expect("C9", { maxDisabled: true, connected: false });
  await evalPage(`window.__proof.setConnected(true)`);
  await evalPage(`window.__proof.setLoading(true)`);
  await evalPage(`window.__proof.render()`);
  await expect("C10.loading", { maxDisabled: true, amountDisabled: true, amountPlaceholder: "Loading balances..." });
  await evalPage(`window.__proof.setLoading(false)`);
  await evalPage(`window.__proof.render()`);
  await expect("C10.restored", { amountDisabled: false, amountPlaceholder: "Enter amount" });
  await runAb(["click", "#withdrawButton"], { timeoutMs: INTERACT_TIMEOUT_MS });
  await poll("C11.label", "window.__proof.observe()", (observed) => observed.label === "Amount (UUSD)");
  await expect("C11", { label: "Amount (UUSD)", maxDisabled: true, selected: "LUSD" });
  await expect("C12", { selectBg: "rgb(17, 17, 17)", inputBg: "rgba(0, 0, 0, 0)" });
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
  if (!fixture.includes("window.__proof")) throw new Error(`${FIXTURE} does not install window.__proof`);
  const bundle = await Deno.readTextFile(`${ROOT}app.js`).catch(() => "");
  if (!bundle.includes("maxButton") || !bundle.includes("amountLabel")) throw new Error(`${ROOT}app.js is stale: it lacks the Max/amount-label code, run \`deno task build\` first`);

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
    // Cleanup gets its own bounded budget, so a main-budget overrun cannot block or extend it. Every spawned CLI
    // command below is still awaited (or killed by its own process timeout) before the next step, so no command is
    // left executing while cleanup proceeds.
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
