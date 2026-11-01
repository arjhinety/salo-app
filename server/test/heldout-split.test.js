// Held-out split tests (--split pilot|main): the split loader, the arguments, the per-folder cost cap and the spend
// reader's tolerance for a line another pass is still writing. Fake datasets written to temp folders, saved fake
// responses, a fake clock and no network. Nothing here reads the real dataset folder or calls the real project.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  run, parseArgs, costCapOf, loadSpendLedger, RecorderError, EDGE_COST_CAP_USD, SPLIT_COST_CAP_USD, SPLIT_OUT_DIR,
  EDGE_IN_FLIGHT_RESERVE, DEFAULT_EDGE_OUT_DIR,
} from "../eval/record-tuning.js";
import { MODEL } from "../src/config.js";
import { loadSplitRows, splitEveningIds, HELDOUT_SPLITS } from "../eval/heldout.js";
import { loadTuningRows } from "../src/tuning.js";

const CSV_HEAD = "message_id,lot_id,donor_id,split,language,difficulty,generation,template_id,message_text,gold_food_item,gold_quantity,gold_unit,gold_est_kg,gold_pickup_by,gold_location,requires_clarification,missing_or_conflicting";
const OFFER_HEAD = "lot_id,evening_id,donor_id,food_item";

function tmpDir(t) {
  const dir = mkdtempSync(join(tmpdir(), "salo-heldout-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Fake dataset: 17 messages per evening (as in the real v1.3 data), each with a lot in food_offers.csv.
// labelOf(evening number, index) gives the split label written on a message row.
function writeFakeDataset(dir, evenings, labelOf, { mutate = null } = {}) {
  const offers = [OFFER_HEAD];
  const msgs = [CSV_HEAD];
  for (const n of evenings) {
    const ev = `E${String(n).padStart(2, "0")}`;
    for (let i = 0; i < 17; i++) {
      const lot = `L${n}-${i}`;
      offers.push(`${lot},${ev},D1,pechay`);
      const id = `X${n}${String(i).padStart(2, "0")}`;
      msgs.push(`${id},${lot},D1,${labelOf(n, i)},en,easy,template,T1,SECRETTEXT ${id},pechay,2,kg,2,,Barangay 1,FALSE,`);
    }
  }
  let m = msgs;
  if (mutate) m = mutate(msgs);
  writeFileSync(join(dir, "food_offers.csv"), `${offers.join("\n")}\n`);
  writeFileSync(join(dir, "donor_messages.csv"), `${m.join("\n")}\n`);
}

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const pilotLabel = () => "pilot";
const mainLabel = () => "main_sample";

test("pilot loader: E11..E20 with split pilot gives exactly 170 rows, all pilot evenings, in file order", (t) => {
  const dir = tmpDir(t);
  writeFakeDataset(dir, range(11, 20), pilotLabel);
  const rows = loadSplitRows("pilot", { dir });
  assert.equal(rows.length, 170);
  assert.equal(new Set(rows.map((r) => r.evening_id)).size, 10);
  assert.ok(rows.every((r) => /^E(1[1-9]|20)$/.test(r.evening_id)));
  assert.equal(rows[0].message_id, "X1100");
  assert.equal(rows[169].message_id, "X2016");
  assert.deepEqual(splitEveningIds("pilot"), range(11, 20).map((n) => `E${n}`));
});

test("main loader: E21..E64 with dataset label main_sample gives exactly 748 rows (44 evenings x 17)", (t) => {
  const dir = tmpDir(t);
  writeFakeDataset(dir, range(21, 64), mainLabel);
  const rows = loadSplitRows("main", { dir });
  assert.equal(rows.length, 748);
  assert.equal(new Set(rows.map((r) => r.evening_id)).size, 44);
  assert.equal(HELDOUT_SPLITS.main.datasetSplit, "main_sample");
});

test("the loader returns only its own split: pilot rows are not in the main load and the reverse", (t) => {
  const dir = tmpDir(t);
  writeFakeDataset(dir, [...range(11, 20), ...range(21, 64)], (n) => (n <= 20 ? "pilot" : "main_sample"));
  const pilot = loadSplitRows("pilot", { dir });
  const main = loadSplitRows("main", { dir });
  assert.equal(pilot.length, 170);
  assert.equal(main.length, 748);
  const pilotIds = new Set(pilot.map((r) => r.message_id));
  assert.ok(main.every((r) => !pilotIds.has(r.message_id)));
});

test("count assertion: nine pilot evenings (153 messages) is refused with the expected count", (t) => {
  const dir = tmpDir(t);
  writeFakeDataset(dir, range(11, 19), pilotLabel);
  assert.throws(() => loadSplitRows("pilot", { dir }), (err) => /expected 170 messages.*got 153/.test(err.message));
});

test("count assertion: main with one evening missing (731 messages) is refused", (t) => {
  const dir = tmpDir(t);
  writeFakeDataset(dir, range(21, 63), mainLabel);
  assert.throws(() => loadSplitRows("main", { dir }), (err) => /expected 748 messages.*got 731/.test(err.message));
});

test("wrong-split refusal: a pilot evening row labelled main_sample is refused, and the error names an id but no text", (t) => {
  const dir = tmpDir(t);
  writeFakeDataset(dir, range(11, 20), (n, i) => (n === 15 && i === 3 ? "main_sample" : "pilot"));
  let thrown = null;
  try {
    loadSplitRows("pilot", { dir });
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, "the load must throw");
  assert.match(thrown.message, /split mismatch/);
  assert.match(thrown.message, /X1503/);
  assert.ok(!thrown.message.includes("SECRETTEXT"), "no message text in the error");
});

test("wrong-split refusal: a tuning-labelled row inside the pilot evenings is refused", (t) => {
  const dir = tmpDir(t);
  writeFakeDataset(dir, range(11, 20), (n, i) => (n === 12 && i === 0 ? "tuning" : "pilot"));
  assert.throws(() => loadSplitRows("pilot", { dir }), /split mismatch/);
});

test("wrong-split refusal: a pilot-labelled row in a main evening is refused on the main load", (t) => {
  const dir = tmpDir(t);
  writeFakeDataset(dir, range(21, 64), (n, i) => (n === 30 && i === 2 ? "pilot" : "main_sample"));
  assert.throws(() => loadSplitRows("main", { dir }), /split mismatch/);
});

test("an unknown split name and a message whose lot is not in food_offers are both refused", (t) => {
  const dir = tmpDir(t);
  writeFakeDataset(dir, range(11, 20), pilotLabel, { mutate: (m) => m.map((l, i) => (i === 1 ? l.replace("L11-0", "NOPE") : l)) });
  assert.throws(() => loadSplitRows("tuning", { dir }), /--split|must be pilot or main|not a known split/);
  assert.throws(() => loadSplitRows("pilot", { dir }), /not in food_offers/);
});

test("a missing dataset file is refused with its name, and the folder is named by env only", (t) => {
  const dir = tmpDir(t);
  assert.throws(() => loadSplitRows("pilot", { dir }), /donor_messages\.csv|food_offers\.csv/);
});

test("tuning default unchanged: no --split means the tuning rows and the tuning cap, and the tuning loader still gives 170", () => {
  const opts = parseArgs(["--target", "edge", "--pass", "1"]);
  assert.equal(opts.split, null);
  assert.equal(opts.outDir, DEFAULT_EDGE_OUT_DIR);
  assert.equal(costCapOf(opts), EDGE_COST_CAP_USD);
  assert.equal(EDGE_COST_CAP_USD, 0.6);
  assert.equal(loadTuningRows().length, 170);
});

test("arguments: --split pilot and main pick their own folders and caps; a bad split, a laptop run, a probe and a non-number cap are refused", () => {
  const p = parseArgs(["--target", "edge", "--split", "pilot", "--pass", "2"]);
  assert.equal(p.outDir, SPLIT_OUT_DIR.pilot);
  assert.ok(SPLIT_OUT_DIR.pilot.replace(/\\/g, "/").endsWith("docs/reports/claude-pilot-edge"));
  assert.equal(costCapOf(p), 0.4);
  const m = parseArgs(["--target", "edge", "--split", "main", "--pass", "1"]);
  assert.ok(m.outDir.replace(/\\/g, "/").endsWith("docs/reports/claude-main-edge"));
  assert.equal(costCapOf(m), 1.5);
  assert.deepEqual(SPLIT_COST_CAP_USD, { pilot: 0.4, main: 1.5 });
  assert.equal(costCapOf(parseArgs(["--target", "edge", "--split", "main", "--pass", "1", "--cost-cap", "0.75"])), 0.75);
  assert.throws(() => parseArgs(["--target", "edge", "--split", "tuning", "--pass", "1"]), /--split must be pilot or main/);
  assert.throws(() => parseArgs(["--split", "pilot", "--pass", "1"]), /needs --target edge/);
  assert.throws(() => parseArgs(["--target", "edge", "--split", "pilot", "--probe"]), /cannot be combined/);
  assert.throws(() => parseArgs(["--target", "edge", "--split", "pilot", "--cost-cap", "abc", "--pass", "1"]), /positive USD/);
  assert.throws(() => parseArgs(["--cost-cap", "0.1", "--pass", "1"]), /needs --target edge/);
  assert.throws(() => parseArgs(["--target", "edge", "--split"]), /needs a value/);
});

test("the three concurrent pilot passes and the three main passes each name their own file (pass number in the name)", () => {
  for (const n of [1, 2, 3]) {
    const o = parseArgs(["--target", "edge", "--split", "pilot", "--pass", String(n)]);
    assert.equal(o.pass, n);
  }
  assert.equal(EDGE_IN_FLIGHT_RESERVE, 3);
});

// Saved fake Edge Function: every /parse answers 200 with a fixed usage. Fake clock; sleep only advances it.
function fakeEdge({ usageInput = 1_000_000 } = {}) {
  const calls = [];
  const HEALTH = { ok: true, model: MODEL, key: true, prompt_sha256: "a".repeat(64), request_config_sha256: "b".repeat(64) };
  const fetchImpl = async (url, init = {}) => {
    if ((init.method ?? "GET") === "GET") {
      calls.push("health");
      return new Response(JSON.stringify(HEALTH), { status: 200, headers: { "content-type": "application/json" } });
    }
    calls.push("parse");
    const body = { is_food_message: false, items: [], pickup_by: null, missing: [],
      usage: { input_tokens: usageInput, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } };
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  };
  const auth = {
    userId: "test-user-id",
    headers: () => ({ apikey: "k", Authorization: "Bearer t" }),
    ensureFresh: async () => {},
    refresh: async () => {},
    registerDevice: async () => {},
  };
  return { calls, fetchImpl, auth };
}

const FAKE_ROWS = Array.from({ length: 5 }, (_, i) => ({ message_id: `P${i}`, evening_id: "E11", message_text: `text ${i}` }));

function splitOpts(outDir, extra = {}) {
  return { target: "edge", split: "pilot", probe: false, pass: 1, outDir, baseUrl: "https://example.test/functions/v1/parse", ...extra };
}

test("cost cap per folder: pilot's 0.40 cap stops the pass after the logged spend reaches it, and nothing more is sent", async (t) => {
  const dir = tmpDir(t);
  // Another pass of this folder already logged 0.25 USD (one million input tokens per call at 0.10 USD per million).
  writeFileSync(join(dir, "pass-2.jsonl"), `${JSON.stringify({ type: "attempt", message_id: "P9", http_status: 200, usage: { input_tokens: 2_500_000, output_tokens: 0 } })}\n`);
  let clock = 1_800_000_000_000;
  const fake = fakeEdge({ usageInput: 1_000_000 });
  const deps = { rows: FAKE_ROWS, now: () => clock, sleep: async (ms) => { clock += ms; }, log: () => {},
    handleSigint: false, gitState: () => ({ commit: null, dirty: null }), fetchImpl: fake.fetchImpl, auth: fake.auth, promptRows: FAKE_ROWS };
  await assert.rejects(run(splitOpts(dir, { pass: 1, costCap: null }), deps), (err) => err instanceof RecorderError && err.reason === "cost_cap");
  const lines = readFileSync(join(dir, "pass-1.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const end = lines.at(-1);
  assert.deepEqual([end.type, end.status, end.reason, end.messages_sent], ["pass_end", "stopped", "cost_cap", 2]);
  // 0.25 logged; each call logs 0.10. Sends 1 and 2 pass (0.35, then 0.45 after the second); the third would be refused.
  assert.equal(fake.calls.filter((c) => c === "parse").length, 2);
  assert.equal(end.target, "edge");
});

test("cost cap per folder: spend in a sibling folder does not count against this folder", async (t) => {
  const root = tmpDir(t);
  const dir = join(root, "claude-pilot-edge");
  const sibling = join(root, "claude-tuning-edge");
  mkdirSync(dir);
  mkdirSync(sibling);
  writeFileSync(join(sibling, "pass-1.jsonl"), `${JSON.stringify({ type: "attempt", message_id: "M0001", http_status: 200, usage: { input_tokens: 90_000_000, output_tokens: 0 } })}\n`);
  let clock = 1_800_000_000_000;
  const fake = fakeEdge({ usageInput: 1_000 });
  const deps = { rows: FAKE_ROWS, now: () => clock, sleep: async (ms) => { clock += ms; }, log: () => {}, handleSigint: false,
    gitState: () => ({ commit: null, dirty: null }), fetchImpl: fake.fetchImpl, auth: fake.auth, promptRows: FAKE_ROWS };
  const stats = await run(splitOpts(dir), deps);
  assert.equal(stats.answered, 5, "the sibling folder's 9 USD does not block the pilot pass");
});

test("a cap passed by flag is the cap used: --cost-cap 0.05 stops a pilot pass well before its folder's 0.40", async (t) => {
  const dir = tmpDir(t);
  let clock = 1_800_000_000_000;
  const fake = fakeEdge({ usageInput: 1_000_000 });
  const deps = { rows: FAKE_ROWS, now: () => clock, sleep: async (ms) => { clock += ms; }, log: () => {}, handleSigint: false,
    gitState: () => ({ commit: null, dirty: null }), fetchImpl: fake.fetchImpl, auth: fake.auth, promptRows: FAKE_ROWS };
  await assert.rejects(run(splitOpts(dir, { costCap: 0.05 }), deps), (err) => err.reason === "cost_cap");
  const end = readFileSync(join(dir, "pass-1.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)).at(-1);
  // Nothing is logged before the first send, so it goes; its 0.10 USD then makes the second send over 0.05.
  assert.equal(end.messages_sent, 1);
});

test("the spend reader skips a last line that another pass is still writing, and counts it once the newline is there", (t) => {
  const dir = tmpDir(t);
  const complete = `${JSON.stringify({ type: "attempt", message_id: "P1", http_status: 200, usage: { input_tokens: 1_000_000, output_tokens: 0 } })}`;
  writeFileSync(join(dir, "pass-1.jsonl"), `${complete}\n{"type":"attempt","message_id":"P2","http_st`);
  const during = loadSpendLedger(dir, FAKE_ROWS).summary();
  assert.ok(Math.abs(during.logged - 0.1) < 1e-9, "the finished line counts, the partial one does not");
  appendFileSync(join(dir, "pass-1.jsonl"), `atus":200,"usage":{"input_tokens":1000000,"output_tokens":0}}\n`);
  const after = loadSpendLedger(dir, FAKE_ROWS).summary();
  assert.ok(Math.abs(after.logged - 0.2) < 1e-9, "once the line is finished it counts exactly once");
});

test("a complete line that is not JSON still stops the spend reader, even at the end of a file", (t) => {
  const dir = tmpDir(t);
  writeFileSync(join(dir, "pass-1.jsonl"), "not json\n");
  assert.throws(() => loadSpendLedger(dir, FAKE_ROWS), (err) => err instanceof RecorderError && err.reason === "cost_ledger");
  const dir2 = tmpDir(t);
  writeFileSync(join(dir2, "pass-1.jsonl"), "{\"type\":\"attempt\",\"message_id\":\"P1\"");
  assert.doesNotThrow(() => loadSpendLedger(dir2, FAKE_ROWS));
});

test("EDGE_COST_CAP_USD is still the tuning cap: nothing in this change moves it", () => {
  assert.equal(EDGE_COST_CAP_USD, 0.6);
});
