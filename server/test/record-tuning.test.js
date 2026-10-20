// Recorder tests with a fake proxy (saved FAKE responses), a fake clock and no network. Tuning rows only (170).
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  run, main, parseArgs, parseRetryAfter, createPacer, RecorderError, MIN_SPACING_MS, MAX_ATTEMPTS, isOutage,
} from "../eval/record-tuning.js";
import { loadTuningRows } from "../src/tuning.js";

const ROWS = loadTuningRows();
const MODEL = "claude-haiku-5-5";
const OK_BODY = { items: [{ food_item: "pork adobo", quantity: 1, unit: "tray" }], pickup_by: "19:00", missing: [], source: "llm", model: MODEL };
const PROMPT_A = "a".repeat(64);
const PROMPT_B = "b".repeat(64);
const COMMIT = "c".repeat(40);
const REQUEST_CONFIG_A = "d".repeat(64);
const REQUEST_CONFIG_B = "e".repeat(64);
const HEALTH_OK = {
  ok: true, model: MODEL, key: true, prompt_sha256: PROMPT_A, request_config_sha256: REQUEST_CONFIG_A, git_commit: COMMIT, git_dirty: false,
};
const UNAVAILABLE = (error_kind) => ({ status: 503, body: { error: "model_unavailable", reason: "model unavailable", error_kind } });
const NETWORK = { networkError: true };
const ATTEMPT_KEYS = ["type", "message_id", "evening_id", "pass", "attempt", "http_status", "retry_after_s", "error", "error_kind",
  "error_detail", "model", "prompt_sha256", "request_config_sha256", "git_commit", "git_dirty", "sent_at", "received_at", "body", "body_text_if_not_json", "usage"];
const END_KEYS = ["type", "pass", "status", "reason", "messages_sent", "ended_at", "model", "prompt_sha256", "request_config_sha256", "git_commit", "git_dirty"];

// Scripted replies per message_id, in order. A message with no script gets one 200. Entries: { status, body, retryAfter }
// or { networkError: true } (fetch throws a TypeError whose cause carries a code and a message with an address).
// changeAfter: from this GET /health call on (counting the start-of-pass call as 1), prompt_sha256 is PROMPT_B.
function fakeProxy(script = {}, { key = true, changeAfter = Infinity, changeRequestConfigAfter = Infinity, health = HEALTH_OK } = {}) {
  let healthCalls = 0;
  const idByText = new Map(ROWS.map((r) => [r.message_text, r.message_id]));
  assert.equal(idByText.size, ROWS.length, "tuning message texts are unique");
  const calls = [];
  const next = new Map();
  const fetchImpl = async (url, init = {}) => {
    if (url.endsWith("/health")) {
      healthCalls++;
      const h = {
        ...health,
        key,
        prompt_sha256: healthCalls >= changeAfter ? PROMPT_B : health.prompt_sha256,
        request_config_sha256: healthCalls >= changeRequestConfigAfter ? REQUEST_CONFIG_B : health.request_config_sha256,
      };
      return new Response(JSON.stringify(h), { status: 200 });
    }
    const text = JSON.parse(init.body).text;
    const id = idByText.get(text);
    calls.push({ id, at: clock.now(), url, headers: init.headers });
    const queue = script[id] ?? [];
    const i = next.get(id) ?? 0;
    next.set(id, i + 1);
    const r = queue[i] ?? { status: 200, body: OK_BODY };
    if (r.networkError) {
      const cause = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:8787"), { code: "ECONNREFUSED" });
      throw Object.assign(new TypeError("fetch failed"), { cause });
    }
    const headers = { "content-type": "application/json" };
    if (r.retryAfter !== undefined) headers["retry-after"] = String(r.retryAfter);
    return new Response(JSON.stringify(r.body), { status: r.status, headers });
  };
  return { fetchImpl, calls };
}

// Fake clock: sleeps advance time instantly and are recorded with their reason.
const clock = { t: 1_000_000, sleeps: [], now() { return this.t; }, async sleep(ms, reason) { this.sleeps.push({ ms, reason }); this.t += ms; } };
function resetClock() {
  clock.t = 1_000_000;
  clock.sleeps = [];
}
const sleepsFor = (reason) => clock.sleeps.filter((s) => s.reason === reason).map((s) => s.ms);

function tmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "salo-recorder-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const opts = (outDir, pass = 1) => ({ baseUrl: "http://127.0.0.1:8787", pass, outDir, dryRun: false });
const allLines = (dir, pass = 1) => readFileSync(join(dir, `pass-${pass}.jsonl`), "utf8").trim().split("\n").map((l) => JSON.parse(l));
const attempts = (dir, pass = 1) => allLines(dir, pass).filter((l) => l.type === "attempt");
const endMarker = (dir, pass = 1) => allLines(dir, pass).at(-1);
const deps = (extra = {}) => ({
  now: () => clock.now(), sleep: (ms, r) => clock.sleep(ms, r), log: () => {}, handleSigint: false, ...extra,
});

test("every attempt is written with type attempt; a full pass ends with a completed marker", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const script = {
    M0001: [{ status: 429, body: { error: "rate_limited" }, retryAfter: 3 }],
    M0002: [{ status: 429, body: { error: "rate_limited" }, retryAfter: 60 }],
    M0003: [{ status: 422, body: { error: "not_food_message", reason: "x" } }],
    M0004: [{ status: 503, body: { error: "model_output_rejected", reason: "model output rejected" } }],
  };
  const { fetchImpl, calls } = fakeProxy(script);
  const stats = await run(opts(dir), { ...deps(), fetchImpl, rows: ROWS });

  const lines = attempts(dir);
  assert.equal(lines.length, 172, "170 messages + 2 retries (M0001, M0002)");
  assert.equal(calls.length, 172);
  assert.equal(stats.attempts, 172);
  assert.equal(stats.http429, 2);
  assert.equal(stats.retries, 2);
  assert.deepEqual(stats.unanswered, []);

  const of = (id) => lines.filter((l) => l.message_id === id);
  assert.deepEqual(of("M0001").map((l) => [l.attempt, l.http_status, l.retry_after_s, l.error]), [[1, 429, 3, "rate_limited"], [2, 200, null, null]]);
  assert.deepEqual(of("M0002").map((l) => [l.attempt, l.http_status, l.retry_after_s]), [[1, 429, 60], [2, 200, null]]);
  assert.deepEqual(of("M0003").map((l) => [l.attempt, l.http_status, l.error]), [[1, 422, "not_food_message"]]);
  assert.deepEqual(of("M0004").map((l) => [l.attempt, l.http_status, l.error]), [[1, 503, "model_output_rejected"]]);
  assert.deepEqual(of("M0003")[0].body, { error: "not_food_message", reason: "x" });

  for (const l of lines) {
    assert.deepEqual(Object.keys(l), ATTEMPT_KEYS);
    assert.equal(l.model, MODEL);
    assert.equal(l.prompt_sha256, PROMPT_A);
    assert.equal(l.request_config_sha256, REQUEST_CONFIG_A);
    assert.equal(l.git_commit, COMMIT);
    assert.equal(l.git_dirty, false);
    assert.equal(l.pass, 1);
    assert.match(l.evening_id, /^E(0[1-9]|10)$/);
    assert.ok(!Number.isNaN(Date.parse(l.sent_at)) && !Number.isNaN(Date.parse(l.received_at)));
  }
  assert.ok(!readFileSync(join(dir, "pass-1.jsonl"), "utf8").includes("Content-Type"), "no request headers are written");

  // The only marker is the last line, and it says completed with all 170 messages sent.
  const end = endMarker(dir);
  assert.equal(end.type, "pass_end");
  assert.deepEqual(Object.keys(end), END_KEYS);
  assert.deepEqual([end.model, end.prompt_sha256, end.request_config_sha256, end.git_commit, end.git_dirty], [MODEL, PROMPT_A, REQUEST_CONFIG_A, COMMIT, false]);
  assert.equal(end.status, "completed");
  assert.equal(end.reason, null);
  assert.equal(end.messages_sent, 170);
  assert.equal(allLines(dir).filter((l) => l.type === "pass_end").length, 1);

  // Waits for 429s are exactly the Retry-After values; no backoff was used.
  assert.deepEqual(sleepsFor("retry_after"), [3000, 60000]);
  assert.deepEqual(sleepsFor("backoff"), []);
  assert.ok(calls.every((c) => c.headers["Content-Type"] === "application/json"));
});

test("sends are at least 2100 ms apart and never more than 30 in any 60 s window (429s, outages and network errors)", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const script = {
    M0001: [{ status: 429, body: {}, retryAfter: 3 }],
    M0002: [UNAVAILABLE("timeout"), { networkError: true }, { status: 200, body: OK_BODY }],
    M0003: [{ status: 429, body: {}, retryAfter: 60 }],
  };
  const { fetchImpl, calls } = fakeProxy(script);
  await run(opts(dir), { ...deps(), fetchImpl, rows: ROWS });

  const times = calls.map((c) => c.at);
  for (let i = 1; i < times.length; i++) {
    assert.ok(times[i] - times[i - 1] >= MIN_SPACING_MS, `gap ${i}: ${times[i] - times[i - 1]} ms`);
  }
  for (const t0 of times) {
    const inWindow = times.filter((s) => s <= t0 && t0 - s < 60_000).length;
    assert.ok(inWindow <= 30, `window ending at ${t0} has ${inWindow} sends`);
  }
  assert.ok(times.at(-1) - times[0] >= (calls.length - 1) * MIN_SPACING_MS);
});

test("5 x 429 on one message: 5 attempts, the message is unanswered, no wait after the fifth", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const five = Array.from({ length: 5 }, () => ({ status: 429, body: { error: "rate_limited" } }));
  const { fetchImpl } = fakeProxy({ M0005: five });
  const stats = await run(opts(dir), { ...deps(), fetchImpl, rows: ROWS });

  const lines = attempts(dir).filter((l) => l.message_id === "M0005");
  assert.deepEqual(lines.map((l) => [l.attempt, l.http_status, l.retry_after_s]), [[1, 429, null], [2, 429, null], [3, 429, null], [4, 429, null], [5, 429, null]]);
  assert.equal(MAX_ATTEMPTS, 5);
  assert.deepEqual(stats.unanswered, ["M0005"]);
  assert.equal(stats.answered, 169);
  assert.deepEqual(sleepsFor("retry_after"), [60000, 60000, 60000, 60000], "a missing Retry-After means 60 s; none after the fifth");
  assert.equal(endMarker(dir).status, "completed", "an unanswered message does not stop the pass");
});

test("503 model_unavailable (each error_kind) is retried with backoff 2, 4, 8, 16 s and can recover on attempt 3", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const script = {
    M0001: [UNAVAILABLE("timeout"), UNAVAILABLE("server")],
    M0002: [UNAVAILABLE("connection"), NETWORK],
    M0003: [NETWORK, UNAVAILABLE("server"), { status: 200, body: OK_BODY }],
  };
  const { fetchImpl } = fakeProxy(script);
  const stats = await run(opts(dir), { ...deps(), fetchImpl, rows: ROWS });

  const of = (id) => attempts(dir).filter((l) => l.message_id === id);
  assert.deepEqual(of("M0001").map((l) => [l.attempt, l.http_status, l.error, l.error_kind]), [[1, 503, "model_unavailable", "timeout"], [2, 503, "model_unavailable", "server"], [3, 200, null, null]]);
  assert.deepEqual(of("M0002").map((l) => [l.attempt, l.http_status, l.error, l.error_kind]), [[1, 503, "model_unavailable", "connection"], [2, null, "network_error", null], [3, 200, null, null]]);
  assert.deepEqual(of("M0003").map((l) => [l.attempt, l.http_status, l.error]), [[1, null, "network_error"], [2, 503, "model_unavailable"], [3, 200, null]]);
  assert.deepEqual(of("M0003")[0].error_detail, "TypeError/ECONNREFUSED", "error class and code only");
  assert.ok(!allLines(dir).some((l) => JSON.stringify(l).includes("127.0.0.1")), "no network message text is written");

  // Backoff before attempt 2, 3, ... of each message; the sleeps are the 2 s, 4 s steps.
  // M0001, M0002, M0003 each wait 2 s then 4 s before their third attempt.
  assert.deepEqual(sleepsFor("backoff"), [2000, 4000, 2000, 4000, 2000, 4000]);
  assert.equal(stats.outageAttempts, 6);
  assert.equal(stats.networkErrors, 2);
  assert.deepEqual(stats.unanswered, []);
  assert.equal(endMarker(dir).status, "completed");
});

test("a message that never recovers: five outage attempts, backoff 2/4/8/16 s, unanswered", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const five = Array.from({ length: 5 }, () => UNAVAILABLE("timeout"));
  const { fetchImpl } = fakeProxy({ M0006: five });
  const stats = await run(opts(dir), { ...deps(), fetchImpl, rows: ROWS });

  assert.equal(attempts(dir).filter((l) => l.message_id === "M0006").length, 5);
  assert.deepEqual(stats.unanswered, ["M0006"]);
  assert.deepEqual(sleepsFor("backoff"), [2000, 4000, 8000, 16000], "no wait after the fifth attempt");
  assert.equal(stats.outageAttempts, 5);
});

test("network errors are retried the same way and recorded as network_error with no message text", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fetchImpl } = fakeProxy({ M0007: [NETWORK, NETWORK, { status: 200, body: OK_BODY }] });
  const stats = await run(opts(dir), { ...deps(), fetchImpl, rows: ROWS });
  const lines = attempts(dir).filter((l) => l.message_id === "M0007");
  assert.deepEqual(lines.map((l) => [l.attempt, l.http_status, l.error, l.error_kind, l.error_detail]), [
    [1, null, "network_error", null, "TypeError/ECONNREFUSED"],
    [2, null, "network_error", null, "TypeError/ECONNREFUSED"],
    [3, 200, null, null, null],
  ]);
  assert.deepEqual(sleepsFor("backoff").slice(0, 2), [2000, 4000]);
  assert.equal(stats.networkErrors, 2);
});

test("503 model_output_rejected and 422 are recorded once and never retried", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fetchImpl } = fakeProxy({
    M0008: [{ status: 503, body: { error: "model_output_rejected", reason: "model output rejected" } }],
    M0009: [{ status: 422, body: { error: "not_food_message", reason: "The message does not offer leftover food." } }],
  });
  const stats = await run(opts(dir), { ...deps(), fetchImpl, rows: ROWS });
  assert.deepEqual(attempts(dir).filter((l) => l.message_id === "M0008").map((l) => [l.attempt, l.http_status, l.error]), [[1, 503, "model_output_rejected"]]);
  assert.deepEqual(attempts(dir).filter((l) => l.message_id === "M0009").map((l) => [l.attempt, l.http_status, l.error]), [[1, 422, "not_food_message"]]);
  assert.equal(stats.retries, 0);
  assert.equal(stats.answered, 170);
  assert.equal(stats.outageAttempts, 0);
  assert.deepEqual(sleepsFor("backoff"), []);
});

test("isOutage: network errors and 503 model_unavailable only", () => {
  assert.equal(isOutage(null, "network_error"), true);
  assert.equal(isOutage(503, "model_unavailable"), true);
  assert.equal(isOutage(503, "model_output_rejected"), false);
  assert.equal(isOutage(429, "rate_limited"), false);
  assert.equal(isOutage(422, "not_food_message"), false);
});

test("auth safety stop: the pass ends at once, the marker says stopped with reason auth, nothing more is sent", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fetchImpl, calls } = fakeProxy({ M0003: [UNAVAILABLE("auth")] });
  await assert.rejects(run(opts(dir), { ...deps(), fetchImpl, rows: ROWS }), (err) => err instanceof RecorderError && err.reason === "auth");
  assert.equal(calls.length, 3, "M0001, M0002 and the auth attempt on M0003 only");
  assert.equal(attempts(dir).length, 3);
  const end = endMarker(dir);
  assert.deepEqual([end.type, end.status, end.reason, end.messages_sent], ["pass_end", "stopped", "auth", 3]);
  assert.deepEqual(sleepsFor("backoff"), [], "no retry after an auth error");
});

test("bad_request safety stop is the same kind of stop", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fetchImpl, calls } = fakeProxy({ M0001: [UNAVAILABLE("bad_request")] });
  await assert.rejects(run(opts(dir), { ...deps(), fetchImpl, rows: ROWS }), (err) => err instanceof RecorderError && err.reason === "bad_request");
  assert.equal(calls.length, 1);
  assert.deepEqual([endMarker(dir).status, endMarker(dir).reason, endMarker(dir).messages_sent], ["stopped", "bad_request", 1]);
});

test("five consecutive messages with no usable response stop the pass", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const five = Array.from({ length: 5 }, () => UNAVAILABLE("server"));
  const script = { M0001: five, M0002: five, M0003: five, M0004: five, M0005: five };
  const { fetchImpl, calls } = fakeProxy(script);
  await assert.rejects(run(opts(dir), { ...deps(), fetchImpl, rows: ROWS }), (err) => err instanceof RecorderError && err.reason === "no_usable_response_x5");
  assert.equal(calls.length, 25);
  const end = endMarker(dir);
  assert.deepEqual([end.status, end.reason, end.messages_sent], ["stopped", "no_usable_response_x5", 5]);
});

test("a caught crash writes a stopped marker with the error name, then rethrows", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fetchImpl } = fakeProxy({ M0001: [UNAVAILABLE("server")] });
  const sleep = (ms, reason) => { if (reason === "backoff") throw Object.assign(new RangeError("disk full"), { name: "RangeError" }); return clock.sleep(ms, reason); };
  await assert.rejects(run(opts(dir), { ...deps({ sleep }), fetchImpl, rows: ROWS }), RangeError);
  const end = endMarker(dir);
  assert.deepEqual([end.status, end.reason, end.messages_sent], ["stopped", "crash: RangeError", 1]);
});

test("a pass file that already exists is refused and left alone", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  writeFileSync(join(dir, "pass-2.jsonl"), '{"keep":true}\n');
  const { fetchImpl, calls } = fakeProxy();
  await assert.rejects(run(opts(dir, 2), { ...deps(), fetchImpl, rows: ROWS }), (err) => err instanceof RecorderError && /already exists/.test(err.message));
  assert.equal(calls.length, 0, "nothing is sent");
  assert.equal(readFileSync(join(dir, "pass-2.jsonl"), "utf8"), '{"keep":true}\n');
});

test("a proxy without a key is refused before anything is sent and writes no file", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fetchImpl, calls } = fakeProxy({}, { key: false });
  await assert.rejects(run(opts(dir), { ...deps(), fetchImpl, rows: ROWS }), (err) => err instanceof RecorderError && err.reason === "no_key");
  assert.equal(calls.length, 0);
  assert.throws(() => readFileSync(join(dir, "pass-1.jsonl")));
});

test("a dry run sends nothing and reads no network", async () => {
  const realFetch = globalThis.fetch;
  let touched = false;
  globalThis.fetch = async () => { touched = true; throw new Error("network used in dry run"); };
  const lines = [];
  try {
    await main(["--pass", "3", "--dry-run"], { rows: ROWS, log: (l) => lines.push(l) });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(touched, false);
  const text = lines.join("\n");
  assert.match(text, /170 tuning messages/);
  assert.match(text, /at least 2100 ms/);
  assert.match(text, /at most 30 sends per 60 s/);
  assert.match(text, /169 gaps x 2\.1 s = 354\.9 s/);
  assert.match(text, /backoff|wait 2, 4, 8, 16 s/);
  assert.match(text, /3 passes \(510 calls\)/);
  assert.match(text, /pass: 3 \(any whole number from 1; the plan is 3 completed passes per request config\)/);
  assert.doesNotMatch(text, / of 3\b/);
  assert.match(text, /Estimate leaves out thinking tokens \(Haiku 5\.5 runs adaptive thinking; they are billed as output\)\. Real spend is measured from the logged usage\./);
});

test("arguments: --pass is any whole number from 1 (4 and 12 accepted), --pass=N works, unknown flags are refused", () => {
  assert.throws(() => parseArgs([]), /--pass <n> is required/);
  assert.equal(parseArgs(["--pass", "4"]).pass, 4);
  assert.equal(parseArgs(["--pass", "12"]).pass, 12);
  assert.match(parseArgs(["--pass", "4"]).outDir, /docs[\\/]reports[\\/]claude-tuning$/);
  for (const bad of ["0", "-1", "2.5", "x", "", "01", "1e3", " 2"]) {
    assert.throws(() => parseArgs(["--pass", bad]), /--pass must be a whole number from 1/, `rejected: "${bad}"`);
  }
  assert.throws(() => parseArgs(["--pass", "1", "--bogus"]), /unknown argument/);
  assert.throws(() => parseArgs(["--pass", "1", "--base-url"]), /needs a value/);
  const o = parseArgs(["--pass=2", "--base-url", "http://10.0.0.5:8787/", "--dry-run"]);
  assert.equal(o.pass, 2);
  assert.equal(o.baseUrl, "http://10.0.0.5:8787");
  assert.equal(o.dryRun, true);
  assert.match(parseArgs(["--pass", "1"]).outDir, /docs[\\/]reports[\\/]claude-tuning$/);
});

test("Retry-After parsing: whole seconds only, otherwise null", () => {
  assert.equal(parseRetryAfter("3"), 3);
  assert.equal(parseRetryAfter(" 60 "), 60);
  assert.equal(parseRetryAfter("0"), 0);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter("Wed, 21 Oct 2026 07:28:00 GMT"), null);
});

test("prompt_changed: /health reports another prompt hash before message 26, so the pass stops at 25 sent", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  // Calls: 1 at the start, 2 at message 26 (index 25). The hash changes from call 2 on.
  const { fetchImpl, calls } = fakeProxy({}, { changeAfter: 2 });
  await assert.rejects(run(opts(dir), { ...deps(), fetchImpl, rows: ROWS }), (err) => err instanceof RecorderError && err.reason === "prompt_changed");
  assert.equal(calls.length, 25, "no message 26 is sent");
  const end = endMarker(dir);
  assert.deepEqual([end.type, end.status, end.reason, end.messages_sent], ["pass_end", "stopped", "prompt_changed", 25]);
  assert.equal(end.prompt_sha256, PROMPT_A, "the marker keeps the hash the pass started with");
  assert.equal(attempts(dir).length, 25);
  assert.ok(attempts(dir).every((l) => l.prompt_sha256 === PROMPT_A));
});

test("/health is re-read every 25 messages: a change first seen at message 51 stops at 50 sent", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fetchImpl } = fakeProxy({}, { changeAfter: 3 });
  await assert.rejects(run(opts(dir), { ...deps(), fetchImpl, rows: ROWS }), (err) => err.reason === "prompt_changed");
  assert.equal(endMarker(dir).messages_sent, 50);
});

test("request_config_changed: the request config hash changes before message 26, so the pass stops at 25 sent", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const { fetchImpl, calls } = fakeProxy({}, { changeRequestConfigAfter: 2 });
  await assert.rejects(run(opts(dir), { ...deps(), fetchImpl, rows: ROWS }), (err) => err instanceof RecorderError && err.reason === "request_config_changed");
  assert.equal(calls.length, 25);
  const end = endMarker(dir);
  assert.deepEqual([end.status, end.reason, end.messages_sent, end.request_config_sha256], ["stopped", "request_config_changed", 25, REQUEST_CONFIG_A]);
});

test("usage: each attempt line carries the usage of its response, or null when the response has none", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const usage = { input_tokens: 1000, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 900 };
  const { fetchImpl } = fakeProxy({
    M0001: [{ status: 503, body: { error: "model_unavailable", reason: "model unavailable", error_kind: "timeout", usage: null } }],
    M0002: [{ status: 200, body: { ...OK_BODY, usage } }],
    M0003: [{ status: 422, body: { error: "not_food_message", reason: "x", usage } }],
  });
  await run(opts(dir), { ...deps(), fetchImpl, rows: ROWS });
  const of = (id) => attempts(dir).filter((l) => l.message_id === id);
  assert.deepEqual(of("M0001").map((l) => l.usage), [null, null]);
  assert.deepEqual(of("M0002")[0].usage, usage);
  assert.deepEqual(of("M0003")[0].usage, usage);
  assert.ok(attempts(dir).every((l) => "usage" in l), "usage is a key on every attempt line");
});

test("a proxy that does not report prompt_sha256 is refused before anything is sent", async (t) => {
  resetClock();
  const dir = tmpDir(t);
  const old = { ok: true, model: MODEL, key: true };
  const { fetchImpl, calls } = fakeProxy({}, { health: old });
  await assert.rejects(run(opts(dir), { ...deps(), fetchImpl, rows: ROWS }), (err) => err instanceof RecorderError && err.reason === "health_failed");
  assert.equal(calls.length, 0);
});

test("pacer: the 31st send in a window waits until the first one leaves it (window rule alone)", async () => {
  let t = 0;
  const pacer = createPacer({ now: () => t, sleep: async (ms) => { t += ms; }, minSpacingMs: 0 });
  const at = [];
  for (let i = 0; i < 31; i++) at.push(await pacer.waitForSlot());
  assert.deepEqual(at.slice(0, 30), Array(30).fill(0));
  assert.equal(at[30], 60_000);
});

test("pacer: spacing rule alone, and a waited Retry-After does not reset it", async () => {
  let t = 0;
  const pacer = createPacer({ now: () => t, sleep: async (ms) => { t += ms; } });
  const a = await pacer.waitForSlot();
  t += 3000; // the caller waited for a Retry-After; the next send still needs its gap after the last send
  const b = await pacer.waitForSlot();
  t += 10;
  const c = await pacer.waitForSlot();
  assert.equal(a, 0);
  assert.equal(b, 3000);
  assert.equal(c, 3000 + MIN_SPACING_MS);
});
