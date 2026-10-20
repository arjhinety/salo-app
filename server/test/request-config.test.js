// request_config_sha256: stable, LF/CRLF-independent, and changed by each input that defines the /parse request. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { requestConfigSha256, currentRequestConfigSha256, canonicalJson, installedSdkVersion, normalizeLf } from "../src/requestConfig.js";
import { ModelOutput } from "../src/schema.js";
import { MODEL, MAX_OUTPUT_TOKENS } from "../src/config.js";
import { REQUEST_EFFORT } from "../src/parse.js";
import { buildSystemPrompt } from "../src/prompt.js";
import { loadTuningRows } from "../src/tuning.js";

const SRC = fileURLToPath(new URL("../src/", import.meta.url));
const SYSTEM = buildSystemPrompt(loadTuningRows());
const SCHEMA = zodOutputFormat(ModelOutput).schema;
const SCHEMA_SRC = readFileSync(`${SRC}schema.js`, "utf8");
const PARSE_SRC = readFileSync(`${SRC}parse.js`, "utf8");
const SDK = installedSdkVersion();

const base = () => ({
  systemPrompt: SYSTEM, outputSchema: SCHEMA, model: MODEL, effort: REQUEST_EFFORT, maxTokens: MAX_OUTPUT_TOKENS,
  schemaSource: SCHEMA_SRC, parseSource: PARSE_SRC, sdkVersion: SDK,
});
const H = (over = {}) => requestConfigSha256({ ...base(), ...over });

test("the hash is 64 hex characters, stable across calls, and equal to the one computed from the real files", () => {
  assert.match(H(), /^[0-9a-f]{64}$/);
  assert.equal(H(), H());
  assert.equal(currentRequestConfigSha256(SYSTEM), H());
});

test("CRLF and LF copies of schema.js and parse.js give the same hash", () => {
  const crlf = (t) => t.replace(/\r?\n/g, "\r\n");
  assert.equal(normalizeLf(crlf(PARSE_SRC)), normalizeLf(PARSE_SRC));
  assert.equal(H({ schemaSource: crlf(SCHEMA_SRC), parseSource: crlf(PARSE_SRC) }), H());
  assert.equal(H({ schemaSource: SCHEMA_SRC.replace(/\n/g, "\r\n"), parseSource: PARSE_SRC.replace(/\n/g, "\r\n") }), H());
});

test("changing the output schema, model, effort, max_tokens, sdk version or the system prompt changes the hash", () => {
  const h0 = H();
  const extended = JSON.parse(JSON.stringify(SCHEMA));
  extended.properties.extra_field = { type: "string" };
  assert.notEqual(H({ outputSchema: extended }), h0, "schema");
  assert.notEqual(H({ model: "claude-haiku-5-6" }), h0, "model");
  assert.notEqual(H({ effort: "medium" }), h0, "effort");
  assert.notEqual(H({ maxTokens: MAX_OUTPUT_TOKENS + 1 }), h0, "max_tokens");
  assert.notEqual(H({ sdkVersion: "0.0.0-test" }), h0, "sdk version");
  assert.notEqual(H({ systemPrompt: SYSTEM + " " }), h0, "system prompt");
});

test("changing schema.js or parse.js (by one character) changes the hash", () => {
  const h0 = H();
  assert.notEqual(H({ schemaSource: SCHEMA_SRC + "\n// edit\n" }), h0, "schema.js");
  assert.notEqual(H({ parseSource: PARSE_SRC + "\n// edit\n" }), h0, "parse.js");
});

test("the hash uses the constants that parse.js actually sends", () => {
  assert.equal(REQUEST_EFFORT, "low");
  assert.equal(MAX_OUTPUT_TOKENS, 2048);
  assert.equal(MODEL, "claude-haiku-5-5");
});

test("canonical JSON sorts keys at every depth and keeps array order", () => {
  assert.equal(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: 2 } }), '{"a":{"c":2,"d":[{"y":2,"z":1}]},"b":1}');
});
