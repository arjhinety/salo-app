// Edge-target recorder tests (--target edge): saved FAKE responses from a fake Edge Function, a mocked supabase client,
// a fake clock and no network. Tuning rows only (170). Nothing here calls the real project.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  run, main, parseArgs, createPacer, createSpendLedger, loadSpendLedger, usageCostUsd, edgeConfig, readGitState,
  RecorderError, EDGE_MIN_SPACING_MS, EDGE_RATE_LIMIT_PER_MINUTE, EDGE_COST_CAP_USD, MAX_ATTEMPTS, PROBE_FILE, REPO_ROOT,
} from "../eval/record-tuning.js";
import { loadTuningRows } from "../src/tuning.js";
import { buildSystemPrompt } from "../src/prompt.js";

const ROWS = loadTuningRows();
const MODEL = "claude-haiku-5-5";
const OK_BODY = { items: [{ food_item: "pork adobo", quantity: 1, unit: "tray" }], pickup_by: "19:00", missing: [], source: "llm", model: MODEL };
const PROMPT_A = "a".repeat(64);
const RC_EDGE = "f".repeat(64);
const GIT = { commit: "c".repeat(40), dirty: true };
const SUPA_URL = "https://fake-project.supabase.co";
const FN_URL = `${SUPA_URL}/functions/v1/parse`;
const PUB = "publishable-fake-key";
const FAKE_ENV = { EXPO_PUBLIC_SUPABASE_URL: `${SUPA_URL}/`, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: PUB };
const EDGE_HEALTH = { ok: true, model: MODEL, key: true, prompt_sha256: PROMPT_A, request_config_sha256: RC_EDGE, sdk_version: "0.135.0" };
const ATTEMPT_KEYS = ["type", "message_id", "evening_id", "pass", "attempt", "http_status", "retry_after_s", "error", "error_kind",
  "error_detail", "model", "prompt_sha256", "request_config_sha256", "git_commit", "git_dirty", "sent_at", "received_at", "body", "body_text_if_not_json", "usage"];
const END_KEYS = ["type", "pass", "status", "reason", "messages_sent", "ended_at", "model", "prompt_sha256", "request_config_sha256", "git_commit", "git_dirty"];
const UNAVAILABLE = (error_kind) => ({ status: 503, body: { error: "model_unavailable", reason: "model unavailable", error_kind } });
const E401 = { status: 401, body: { code: 401, message: "Invalid JWT" } };
const USAGE = (input_tokens) => ({ input_tokens, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 });

// Fake clock: sleeps advance time instantly and are recorded with their reason.
const clock = { t: 1_000_000, sleeps: [], now() { return this.t; }, async sleep(ms, reason) { this.sleeps.push({ ms, reason }); this.t += ms; } };
function resetClock() {
  clock.t = 1_000_000;
  clock.sleeps = [];
}
const sleepsFor = (reason) => clock.sleeps.filter((s) => s.reason === reason).map((s) => s.ms);

function tmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "salo-edge-recorder-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const readLines = (path) => readFileSync(path, "utf8").trim().split("\n").map((l) => JSON.parse(l));
const passLines = (dir, pass = 1) => readLines(join(dir, `pass-${pass}.jsonl`));
const attempts = (dir, pass = 1) => passLines(dir, pass).filter((l) => l.type === "attempt");
const endMarker = (dir, pass = 1) => passLines(dir, pass).at(-1);

// Fake Edge Function. Scripts per message id (in order); a message with no script gets one 200 (with defaultUsage if set).
// Records every request. Assertions happen in the tests, never inside the fake (a throw here would look like a network error).
function fakeFunction(script = {}, { healthScript = [], events = [], defaultUsage = null } = {}) {
  const idByText = new Map(ROWS.map((r) => [r.message_text, r.message_id]));
  const next = new Map();
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const headers = init.headers ?? {};
    if (init.method === "GET") {
      calls.push({ kind: "health", url, method: "GET", headers, at: clock.now() });
      events.push("health");
      const h = healthScript.shift() ?? { status: 200, body: EDGE_HEALTH };
      if (h.status !== 200) return new Response(JSON.stringify(h.body ?? { code: h.status }), { status: h.status, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify(h.body ?? EDGE_HEALTH), { status: 200, headers: { "content-type": "application/json" } });
    }
    const text = JSON.parse(init.body).text;
    const id = idByText.get(text);
    calls.push({ kind: "parse", id, url, method: init.method, headers, at: clock.now() });
    events.push("parse");
    const queue = script[id] ?? [];
    const i = next.get(id) ?? 0;
    next.set(id, i + 1);
    const r = queue[i] ?? { status: 200, body: defaultUsage ? { ...OK_BODY, usage: defaultUsage } : OK_BODY };
    if (r.networkError) {
      const cause = Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      throw Object.assign(new TypeError("fetch failed"), { cause });
    }
    const hdrs = { "content-type": "application/json" };
    if (r.retryAfter !== undefined) hdrs["retry-after"] = String(r.retryAfter);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: hdrs });
  };
  return { fetchImpl, calls };
}

// Mocked supabase-js client: anonymous sign-in, refreshSession and the devices upsert. refreshScript entries:
// { ok: true } (default), { error } or { throw: true }.
function fakeSupabase({ refreshScript = [], signInError = null, upsertError = null, expiresInS = 3600, events = [] } = {}) {
  const state = { created: [], signIns: 0, refreshes: [], upserts: [], tokenNo: 0 };
  const session = (expiresIn) => {
    state.tokenNo++;
    return { access_token: `access-${state.tokenNo}`, refresh_token: `refresh-${state.tokenNo}`, expires_at: Math.floor(clock.now() / 1000) + expiresIn, user: { id: "user-1" } };
  };
  const createClient = (url, key, options) => {
    state.created.push({ url, key, options });
    return {
      auth: {
        async signInAnonymously() {
          state.signIns++;
          if (signInError) return { data: { session: null, user: null }, error: signInError };
          return { data: { session: session(expiresInS), user: { id: "user-1" } }, error: null };
        },
        async refreshSession(arg) {
          state.refreshes.push(arg);
          events.push("refresh");
          const next = refreshScript.shift() ?? { ok: true };
          if (next.throw) throw new Error("fetch failed");
          if (next.error) return { data: { session: null }, error: next.error };
          return { data: { session: session(3600) }, error: null };
        },
      },
      from(table) {
        return {
          async upsert(row, opts) {
            state.upserts.push({ table, row, opts });
            events.push("upsert");
            return { data: null, error: upsertError };
          },
        };
      },
    };
  };
  return { createClient, state };
}

function setup({ script = {}, healthScript = [], refreshScript = [], signInError = null, upsertError = null, expiresInS = 3600, defaultUsage = null } = {}) {
  const events = [];
  const fn = fakeFunction(script, { healthScript, events, defaultUsage });
  const sb = fakeSupabase({ refreshScript, signInError, upsertError, expiresInS, events });
  const logs = [];
  const deps = {
    now: () => clock.now(), sleep: (ms, r) => clock.sleep(ms, r), log: (m) => logs.push(m), handleSigint: false,
    fetchImpl: fn.fetchImpl, createClient: sb.createClient, gitState: () => GIT, rows: ROWS,
  };
  return { fn, sb, logs, events, deps };
}

const edgeOpts = (outDir, pass = 1, extra = {}) => ({
  target: "edge", baseUrl: FN_URL, supabase: { url: SUPA_URL, key: PUB }, pass, outDir, dryRun: false, probe: false, ...extra,
});
const parseCalls = (fn) => fn.calls.filter((c) => c.kind === "parse");

test("edge pacing: 170 messages, at least 6.1 s between sends, never more than 10 in any 60 s window (429, outage and retry included)", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, deps } = setup({
    script: {
      M0001: [{ status: 429, body: { error: "rate_limited", reason: "too many requests" }, retryAfter: 3 }],
      M0002: [UNAVAILABLE("timeout"), { status: 200, body: OK_BODY }],
    },
  });
  await run(edgeOpts(dir), { ...deps });

  const times = parseCalls(fn).map((c) => c.at);
  assert.equal(times.length, 172, "170 messages + 2 retries");
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] - times[i - 1] >= EDGE_MIN_SPACING_MS, `gap ${i}: ${times[i] - times[i - 1]} ms`);
  }
  for (const t0 of times) {
    const inWindow = times.filter((s) => s <= t0 && t0 - s < 60_000).length;
    assert.ok(inWindow <= EDGE_RATE_LIMIT_PER_MINUTE, `window ending at ${t0} has ${inWindow} sends`);
  }
  assert.equal(EDGE_MIN_SPACING_MS, 6100);
  assert.equal(EDGE_RATE_LIMIT_PER_MINUTE, 10);
  assert.equal(endMarker(dir).status, "completed");
  assert.equal(endMarker(dir).messages_sent, 170);
});

test("the function's 429 with Retry-After waits Retry-After, then resends; pacing still holds", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, deps } = setup({ script: { M0001: [{ status: 429, body: { error: "rate_limited", reason: "too many requests" }, retryAfter: 7 }] } });
  await run(edgeOpts(dir), deps);
  const m1 = parseCalls(fn).filter((c) => c.id === "M0001");
  assert.equal(m1.length, 2);
  assert.equal(m1[1].at - m1[0].at, 7000, "resend exactly Retry-After after the 429");
  assert.deepEqual(sleepsFor("retry_after"), [7000]);
  assert.deepEqual(attempts(dir).filter((l) => l.message_id === "M0001").map((l) => [l.attempt, l.http_status, l.retry_after_s, l.error]),
    [[1, 429, 7, "rate_limited"], [2, 200, null, null]]);
  assert.equal(endMarker(dir).status, "completed");
});

test("401 refreshes the session once and the resend succeeds with the new token", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, sb, deps } = setup({ script: { M0001: [E401] } });
  await run(edgeOpts(dir), deps);
  assert.deepEqual(sb.state.refreshes, [{ refresh_token: "refresh-1" }]);
  const m1 = parseCalls(fn).filter((c) => c.id === "M0001");
  assert.deepEqual(m1.map((c) => c.headers.Authorization), ["Bearer access-1", "Bearer access-2"]);
  assert.deepEqual(attempts(dir).filter((l) => l.message_id === "M0001").map((l) => [l.attempt, l.http_status]), [[1, 401], [2, 200]]);
  const end = endMarker(dir);
  assert.deepEqual([end.status, end.reason, end.messages_sent], ["completed", null, 170]);
});

test("401 twice (the resend after the refresh is also 401): the pass stops with reason auth", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, sb, deps } = setup({ script: { M0001: [E401, E401] } });
  await assert.rejects(run(edgeOpts(dir), deps), (err) => err instanceof RecorderError && err.reason === "auth");
  assert.equal(sb.state.refreshes.length, 1, "one refresh, not two");
  assert.equal(parseCalls(fn).length, 2, "nothing is sent after the second 401");
  const end = endMarker(dir);
  assert.deepEqual([end.type, end.status, end.reason, end.messages_sent, end.target], ["pass_end", "stopped", "auth", 1, "edge"]);
});

test("a token refresh that fails stops the pass with reason auth, with nothing more sent", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, deps } = setup({ script: { M0001: [E401] }, refreshScript: [{ error: { name: "AuthApiError", status: 400, code: "refresh_token_not_found" } }] });
  await assert.rejects(run(edgeOpts(dir), deps), (err) => err instanceof RecorderError && err.reason === "auth");
  assert.equal(parseCalls(fn).length, 1);
  assert.equal(endMarker(dir).reason, "auth");
});

test("/health answering 401 twice stops the pass with reason auth before any send, and writes no pass file", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, sb, deps } = setup({ healthScript: [{ status: 401 }, { status: 401 }] });
  await assert.rejects(run(edgeOpts(dir), deps), (err) => err instanceof RecorderError && err.reason === "auth");
  assert.equal(sb.state.refreshes.length, 1);
  assert.equal(parseCalls(fn).length, 0);
  assert.equal(existsSync(join(dir, "pass-1.jsonl")), false);
});

test("the session is refreshed before it expires: a token due within 120 s is refreshed before the first request", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const events = [];
  const sb = fakeSupabase({ expiresInS: 60, events });
  const fn = fakeFunction({}, { events });
  const deps = {
    now: () => clock.now(), sleep: (ms, r) => clock.sleep(ms, r), log: () => {}, handleSigint: false,
    fetchImpl: fn.fetchImpl, createClient: sb.createClient, gitState: () => GIT, rows: ROWS,
  };
  await run(edgeOpts(dir), deps);
  assert.equal(events[0], "refresh", "the first event is the refresh, before /health");
  assert.equal(sb.state.refreshes.length, 1, "only one refresh: the new token lasts an hour");
});

test("cost cap before the first send: logged spend of 0.5995 USD plus a worst case stops the pass with cost_cap and nothing is sent", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  writeFileSync(join(dir, "pass-1.jsonl"), `${JSON.stringify({ type: "attempt", message_id: "M0001", http_status: 200, error: null, usage: USAGE(5_995_000) })}\n`);
  const { fn, deps } = setup();
  await assert.rejects(run(edgeOpts(dir, 2), deps), (err) => err instanceof RecorderError && err.reason === "cost_cap");
  assert.equal(parseCalls(fn).length, 0);
  const end = endMarker(dir, 2);
  assert.deepEqual([end.status, end.reason, end.messages_sent], ["stopped", "cost_cap", 0]);
  assert.equal(readFileSync(join(dir, "pass-1.jsonl"), "utf8").split("\n").filter(Boolean).length, 1, "the earlier file is untouched");
});

test("cost cap mid-run: four calls at 0.15 USD reach 0.60, so the fifth is refused and nothing more is sent", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, deps } = setup({ defaultUsage: USAGE(1_500_000) });
  await assert.rejects(run(edgeOpts(dir), deps), (err) => err instanceof RecorderError && err.reason === "cost_cap");
  assert.equal(parseCalls(fn).length, 4);
  const end = endMarker(dir);
  assert.deepEqual([end.status, end.reason, end.messages_sent], ["stopped", "cost_cap", 4]);
  const total = attempts(dir).reduce((s, l) => s + usageCostUsd(l.usage), 0);
  assert.ok(Math.abs(total - 0.6) < 1e-9, `logged total ${total}`);
  assert.ok(total <= EDGE_COST_CAP_USD + 1e-9);
});

test("cost ledger: a 429 or a non-outage attempt with no usage costs nothing; an outage with no usage counts at its worst case", () => {
  const ledger = createSpendLedger(ROWS, buildSystemPrompt(ROWS));
  const row = ROWS[0];
  const w = ledger.worstFor(row);
  assert.ok(w > 0.001024, "the worst case is at least the 2048 output tokens: 0.001024 USD");
  ledger.addAttempt({ message_id: row.message_id, usage: null, http_status: 429, error: "rate_limited" });
  ledger.addAttempt({ message_id: row.message_id, usage: null, http_status: 401, error: null });
  ledger.addAttempt({ message_id: row.message_id, usage: null, http_status: 422, error: "not_food_message" });
  assert.equal(ledger.total(), 0);
  ledger.addAttempt({ message_id: row.message_id, usage: null, http_status: 503, error: "model_unavailable" });
  ledger.addAttempt({ message_id: row.message_id, usage: null, http_status: null, error: "network_error" });
  assert.ok(Math.abs(ledger.total() - 2 * w) < 1e-12);
  ledger.addAttempt({ message_id: row.message_id, usage: USAGE(1_000_000), http_status: 200, error: null });
  assert.ok(Math.abs(ledger.total() - (2 * w + 0.1)) < 1e-9);
});

test("the cost ledger reads every .jsonl in the edge folder, including the probe file", (t) => {
  const dir = tmpDir(t);
  writeFileSync(join(dir, PROBE_FILE), `${JSON.stringify({ type: "attempt", message_id: "M0001", http_status: 200, error: null, usage: USAGE(2_000_000) })}\n`);
  writeFileSync(join(dir, "pass-1.jsonl"), `${JSON.stringify({ type: "attempt", message_id: "M0002", http_status: 200, error: null, usage: USAGE(1_000_000) })}\n`);
  const s = loadSpendLedger(dir, ROWS).summary();
  assert.deepEqual(s.files, [PROBE_FILE, "pass-1.jsonl"].sort());
  assert.ok(Math.abs(s.logged - 0.3) < 1e-9);
});

test("a malformed line in an earlier file stops the pass before any send (the guard cannot read it)", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  writeFileSync(join(dir, "pass-1.jsonl"), "not json\n");
  const { fn, deps } = setup();
  await assert.rejects(run(edgeOpts(dir, 2), deps), (err) => err instanceof RecorderError && err.reason === "cost_ledger");
  assert.equal(parseCalls(fn).length, 0);
});

test("every request goes to the function URL with apikey and a Bearer token; /health uses the same auth", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, deps } = setup({ script: { M0001: [E401] } });
  await run(edgeOpts(dir), deps);
  // /health at the start and re-read before messages 26, 51, ..., 151: 1 + 6 = 7 calls for 170 messages.
  const health = fn.calls.filter((c) => c.kind === "health");
  assert.equal(health.length, 7);
  // The 401 on message 1 refreshed the token, so the start-of-pass call uses access-1 and every later call access-2.
  for (const h of health) {
    assert.equal(h.url, `${FN_URL}/health`);
    assert.equal(h.headers.apikey, PUB);
  }
  assert.equal(health[0].headers.Authorization, "Bearer access-1");
  assert.ok(health.slice(1).every((h) => h.headers.Authorization === "Bearer access-2"));
  for (const c of parseCalls(fn)) {
    assert.equal(c.url, FN_URL, "POST goes to the function URL itself, with no /parse suffix");
    assert.equal(c.headers.apikey, PUB);
    assert.match(c.headers.Authorization, /^Bearer access-\d+$/);
    assert.equal(c.headers["Content-Type"], "application/json");
  }
});

test("one devices row is registered before the first send, shaped like the app's upsert; the auth user id is printed; no secret is printed", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { sb, logs, events, deps } = setup({ script: { M0001: [E401] } });
  await run(edgeOpts(dir), deps);
  assert.deepEqual(sb.state.upserts, [{
    table: "devices",
    row: { id: "user-1", role: "dashboard", profile_id: null },
    opts: { onConflict: "id", ignoreDuplicates: true },
  }]);
  assert.ok(events.indexOf("upsert") < events.indexOf("parse"), "registration comes first");
  assert.ok(logs.includes("auth user id (for cleanup): user-1"));
  const printed = logs.join("\n");
  assert.ok(!printed.includes(PUB), "the key is never printed");
  assert.ok(!printed.includes("access-") && !printed.includes("refresh-"), "no token is printed");
  assert.equal(sb.state.created[0].url, SUPA_URL);
  assert.deepEqual(sb.state.created[0].options.auth, { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false });
});

test("target edge is on every attempt line and on the pass_end marker; the key set is the laptop key set plus target", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { deps } = setup({ script: { M0001: [{ status: 429, body: { error: "rate_limited", reason: "x" }, retryAfter: 1 }] } });
  await run(edgeOpts(dir), deps);
  for (const l of attempts(dir)) {
    assert.deepEqual(Object.keys(l), [...ATTEMPT_KEYS, "target"]);
    assert.equal(l.target, "edge");
    assert.equal(l.git_commit, GIT.commit, "local repo commit, since /health has none");
    assert.equal(l.git_dirty, true);
    assert.equal(l.request_config_sha256, RC_EDGE);
    assert.equal(l.prompt_sha256, PROMPT_A);
    assert.equal(l.model, MODEL);
  }
  const end = endMarker(dir);
  assert.deepEqual(Object.keys(end), [...END_KEYS, "target"]);
  assert.equal(end.target, "edge");
  assert.equal(end.request_config_sha256, RC_EDGE);
});

test("a 403 device_not_registered is a setup fault: the pass stops at once with that reason", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, deps } = setup({ script: { M0001: [{ status: 403, body: { error: "device_not_registered", reason: "register this device before parsing", usage: null } }] } });
  await assert.rejects(run(edgeOpts(dir), deps), (err) => err instanceof RecorderError && err.reason === "device_not_registered");
  assert.equal(parseCalls(fn).length, 1);
  assert.equal(endMarker(dir).reason, "device_not_registered");
});

test("a 400 bad_request from the function is a setup fault too", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, deps } = setup({ script: { M0001: [{ status: 400, body: { error: "bad_request", reason: 'body must be {"text": string}', usage: null } }] } });
  await assert.rejects(run(edgeOpts(dir), deps), (err) => err instanceof RecorderError && err.reason === "bad_request");
  assert.equal(parseCalls(fn).length, 1);
});

test("a device registration that fails stops the pass before any file or send", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, deps } = setup({ upsertError: { name: "PostgrestError", code: "42501" } });
  await assert.rejects(run(edgeOpts(dir), deps), (err) => err instanceof RecorderError && err.reason === "device_registration_failed");
  assert.equal(parseCalls(fn).length, 0);
  assert.equal(existsSync(join(dir, "pass-1.jsonl")), false);
});

test("edge dry run: calls only GET /health (after the sign-in its auth needs), prints the plan, registers no device and writes no file", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, sb, logs, deps } = setup();
  const out = await main(["--target", "edge", "--pass", "1", "--out-dir", dir, "--dry-run"], { ...deps, env: FAKE_ENV });
  assert.equal(out, null);
  assert.deepEqual(fn.calls.map((c) => [c.kind, c.method]), [["health", "GET"]]);
  assert.equal(sb.state.upserts.length, 0);
  assert.equal(existsSync(join(dir, "pass-1.jsonl")), false);
  const text = logs.join("\n");
  for (const s of [
    "nothing parsed", "at least 6100 ms between sends", "at most 10 sends per 60 s", "$0.60 cap", "SDK retries",
    "registers nothing", "170 tuning messages", "minimum duration: 169 gaps x 6.1 s = 1030.9 s",
  ]) {
    assert.ok(text.includes(s), `the plan says: ${s}`);
  }
  assert.ok(!text.includes(PUB) && !text.includes("access-"), "no secret in the plan");
});

test("probe: one message to probe.jsonl with a stopped probe marker; no pass file is created", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fn, deps } = setup();
  await main(["--target", "edge", "--probe", "--out-dir", dir], { ...deps, env: FAKE_ENV });
  assert.deepEqual(parseCalls(fn).map((c) => c.id), [ROWS[0].message_id]);
  assert.equal(existsSync(join(dir, "pass-1.jsonl")), false);
  const lines = readLines(join(dir, PROBE_FILE));
  assert.equal(lines.length, 2);
  const end = lines[1];
  assert.deepEqual([end.type, end.status, end.reason, end.messages_sent, end.pass, end.target], ["pass_end", "stopped", "probe", 1, 0, "edge"]);
  assert.equal(lines[0].target, "edge");
});

test("edge arguments: default folder is docs/reports/claude-tuning-edge; --base-url is refused; --probe needs edge and no --pass", () => {
  const edge = parseArgs(["--target", "edge", "--pass", "2"]);
  assert.equal(edge.target, "edge");
  assert.match(edge.outDir, /docs[\\/]reports[\\/]claude-tuning-edge$/);
  assert.equal(parseArgs(["--target=edge", "--pass=3", "--out-dir", "x"]).outDir.endsWith("x"), true);
  assert.equal(parseArgs(["--pass", "1"]).target, "laptop");
  assert.throws(() => parseArgs(["--target", "edge", "--pass", "1", "--base-url", "http://127.0.0.1:8787"]), /--base-url is for the laptop proxy/);
  assert.throws(() => parseArgs(["--target", "bogus", "--pass", "1"]), /--target must be laptop or edge/);
  assert.throws(() => parseArgs(["--pass", "1", "--probe"]), /--probe needs --target edge/);
  assert.throws(() => parseArgs(["--target", "edge", "--probe", "--pass", "1"]), /takes no --pass/);
  const probe = parseArgs(["--target", "edge", "--probe"]);
  assert.equal(probe.probe, true);
  assert.equal(probe.pass, null);
  assert.throws(() => parseArgs(["--target", "edge"]), /--pass <n> is required/);
});

test("edge config is read from the root .env names; errors name the variable and never print its value", () => {
  const cfg = edgeConfig({ EXPO_PUBLIC_SUPABASE_URL: `${SUPA_URL}/`, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: " k " });
  assert.deepEqual(cfg, { url: SUPA_URL, key: "k", functionUrl: FN_URL });
  assert.throws(() => edgeConfig({ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" }), /EXPO_PUBLIC_SUPABASE_URL is not set/);
  assert.throws(() => edgeConfig({ EXPO_PUBLIC_SUPABASE_URL: SUPA_URL }), /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set/);
  assert.throws(() => edgeConfig({ EXPO_PUBLIC_SUPABASE_URL: "http://plain.example", EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "k" }), (err) => {
    assert.ok(!err.message.includes("plain.example"));
    return /must start with https/.test(err.message);
  });
});

test("usage cost formula: 1M of each token kind is 0.1 + 0.125 + 0.01 + 0.5 = 0.735 USD", () => {
  const u = { input_tokens: 1e6, output_tokens: 1e6, cache_creation_input_tokens: 1e6, cache_read_input_tokens: 1e6 };
  assert.ok(Math.abs(usageCostUsd(u) - 0.735) < 1e-12);
  assert.equal(usageCostUsd({ input_tokens: null, output_tokens: null, cache_creation_input_tokens: null, cache_read_input_tokens: null }), 0);
});

test("edge pacer: the gap is 6.1 s, so the 11th send lands at 61 s; the window rule alone would allow it at 60 s", async () => {
  let t = 0;
  const pacer = createPacer({ now: () => t, sleep: async (ms) => { t += ms; }, limit: EDGE_RATE_LIMIT_PER_MINUTE, minSpacingMs: EDGE_MIN_SPACING_MS });
  const at = [];
  for (let i = 0; i < 11; i++) at.push(await pacer.waitForSlot());
  assert.equal(at[1], 6100);
  assert.equal(at[9], 54_900);
  assert.equal(at[10], 61_000, "spacing (54.9 s + 6.1 s) holds the 11th; no more than 10 sends in any 60 s");

  let u = 0;
  const windowOnly = createPacer({ now: () => u, sleep: async (ms) => { u += ms; }, limit: EDGE_RATE_LIMIT_PER_MINUTE, minSpacingMs: 0 });
  const bt = [];
  for (let i = 0; i < 11; i++) bt.push(await windowOnly.waitForSlot());
  assert.equal(bt[9], 0);
  assert.equal(bt[10], 60_000, "with no spacing rule, the window rule releases the 11th at 60 s");
});

test("git state for the edge lines: a 40-hex commit or null, a boolean dirty flag or null (never throws)", () => {
  const g = readGitState({ repoRoot: REPO_ROOT, exclude: "docs/reports/claude-tuning-edge" });
  assert.ok(g.commit === null || /^[0-9a-f]{40}$/.test(g.commit));
  assert.ok(g.dirty === null || typeof g.dirty === "boolean");
  assert.deepEqual(readGitState({ repoRoot: join(tmpdir(), "no-such-repo-for-salo-test") }), { commit: null, dirty: null });
});
