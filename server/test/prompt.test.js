// Data-scope tests: the prompt may only be built from the tuning file (evenings E01..E10).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCsv } from "../src/csv.js";
import { loadTuningRows, TUNING_CSV_URL } from "../src/tuning.js";
import { PROMPT_EXAMPLES, buildSystemPrompt, canonicalPairs } from "../src/prompt.js";

// Hard rule (Arjhine, 2026-10-20): filter by evening_id first, then assert every row passed.
const allRows = parseCsv(readFileSync(TUNING_CSV_URL, "utf8"));
const kept = allRows.filter((r) => /^E(0[1-9]|10)$/.test(r.evening_id));

test("tuning filter keeps every row: E01..E10 only, split tuning, exactly 170", () => {
  assert.equal(kept.length, allRows.length);
  assert.equal(kept.length, 170);
  assert.ok(kept.every((r) => r.split === "tuning"));
});

test("loadTuningRows (used at startup) agrees with the filter above", () => {
  const rows = loadTuningRows();
  assert.equal(rows.length, 170);
  assert.deepEqual(rows.map((r) => r.message_id), kept.map((r) => r.message_id));
});

test("canonical list is 21 distinct (food_item, unit) pairs from the tuning gold columns", () => {
  const pairs = canonicalPairs(kept);
  assert.equal(pairs.length, 21);
  assert.ok(pairs.every((p) => p.food_item && p.unit));
});

test("every prompt example is a verbatim tuning row with matching gold values", () => {
  assert.equal(PROMPT_EXAMPLES.length, 3);
  const prompt = buildSystemPrompt(kept);
  for (const e of PROMPT_EXAMPLES) {
    const row = kept.find((r) => r.message_id === e.message_id);
    assert.ok(row, `${e.message_id} is not a tuning row`);
    assert.match(row.evening_id, /^E(0[1-9]|10)$/);
    assert.equal(row.message_text, e.text, `${e.message_id} text is not verbatim`);
    assert.ok(prompt.includes(JSON.stringify(e.text)), `${e.message_id} text is not in the system prompt`);
    const item = e.output.items[0];
    assert.equal(row.gold_food_item, item.food_item);
    assert.equal(Number(row.gold_quantity), item.quantity);
    assert.equal(row.gold_unit, item.unit);
    assert.equal(row.gold_pickup_by, e.output.pickup_by);
  }
});

test("system prompt is identical across builds (cacheable, no timestamps)", () => {
  assert.equal(buildSystemPrompt(loadTuningRows()), buildSystemPrompt(loadTuningRows()));
});

test("server source never references food_offers.csv, the full donor_messages.csv, or pilot/main data", () => {
  const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
  const forbidden = [/food_offers/, /donor_messages(?!_tuning)/, /salo-evening-dataset/, /\.\.\/dataset/];
  for (const f of readdirSync(srcDir).filter((n) => n.endsWith(".js"))) {
    const text = readFileSync(srcDir + f, "utf8");
    for (const re of forbidden) assert.doesNotMatch(text, re, `${f} matches ${re}`);
  }
});
