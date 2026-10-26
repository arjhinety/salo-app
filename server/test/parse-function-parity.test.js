// Parity between the laptop proxy (server/src) and the Supabase Edge Function (supabase/functions/parse). No network.
// The function's prompt must be byte-identical to buildSystemPrompt(); its generated data must match the tuning file
// (filter and assertions in scripts/gen-parse-prompt-data.mjs) and the current sources.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSystemPrompt, canonicalPairs } from "../src/prompt.js";
import { loadTuningRows } from "../src/tuning.js";
import { normalizeLf } from "../src/requestConfig.js";
import { buildSystemPrompt as fnBuildSystemPrompt } from "../../supabase/functions/parse/prompt.ts";
import { CANONICAL_PAIRS, PROMPT_EXAMPLES } from "../../supabase/functions/parse/promptData.ts";
import { OUTPUT_SCHEMA_SHA256, SCHEMA_TS_LF_SHA256, PARSE_TS_LF_SHA256 } from "../../supabase/functions/parse/buildInfo.ts";
import { generateAll, serverOutputSchemaCanonical } from "../../scripts/gen-parse-prompt-data.mjs";

const FN = fileURLToPath(new URL("../../supabase/functions/parse/", import.meta.url));

test("the function's system prompt is byte-identical to the laptop proxy's", () => {
  const laptop = buildSystemPrompt(loadTuningRows());
  const fn = fnBuildSystemPrompt();
  assert.equal(fn, laptop);
  assert.equal(Buffer.from(fn, "utf8").equals(Buffer.from(laptop, "utf8")), true);
});

test("the generated canonical pairs and examples equal the server's, from the 170 tuning rows", () => {
  const rows = loadTuningRows();
  assert.deepEqual(CANONICAL_PAIRS, canonicalPairs(rows));
  assert.equal(CANONICAL_PAIRS.length, 21);
  assert.deepEqual(PROMPT_EXAMPLES.map((e) => e.message_id), ["M0001", "M0008", "M0025"]);
});

test("generated files are up to date with the tuning file and the current sources (drift check)", () => {
  const out = generateAll();
  assert.equal(readFileSync(`${FN}promptData.ts`, "utf8"), out.promptData, "promptData.ts is stale: run node scripts/gen-parse-prompt-data.mjs");
  assert.equal(readFileSync(`${FN}buildInfo.ts`, "utf8"), out.buildInfo, "buildInfo.ts is stale: run node scripts/gen-parse-prompt-data.mjs");
});

const sha = (t) => createHash("sha256").update(t, "utf8").digest("hex");

test("embedded source digests equal schema.ts and parse.ts on disk (LF-normalised, sha256)", () => {
  assert.equal(SCHEMA_TS_LF_SHA256, sha(normalizeLf(readFileSync(`${FN}schema.ts`, "utf8"))));
  assert.equal(PARSE_TS_LF_SHA256, sha(normalizeLf(readFileSync(`${FN}parse.ts`, "utf8"))));
});

test("the output JSON Schema digest equals the laptop proxy zodOutputFormat schema (sha256 of canonical JSON)", () => {
  assert.equal(OUTPUT_SCHEMA_SHA256, sha(serverOutputSchemaCanonical()));
});
