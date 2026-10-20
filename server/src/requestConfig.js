// request_config_sha256: one hash of everything that defines a /parse request, so that two runs can be compared only when
// they sent the same request. Inputs: the system prompt, the output JSON Schema (zodOutputFormat(ModelOutput).schema),
// model, effort, max_tokens, the source text of schema.js and parse.js (LF-normalised, so CRLF and LF checkouts agree),
// and the installed SDK version. model, effort and max_tokens come from the same constants parse.js uses.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MODEL, MAX_OUTPUT_TOKENS } from "./config.js";
import { REQUEST_EFFORT } from "./parse.js";
import { ModelOutput } from "./schema.js";

const SRC_DIR = fileURLToPath(new URL(".", import.meta.url));
const SERVER_DIR = fileURLToPath(new URL("..", import.meta.url));

// Object keys sorted at every depth, arrays kept in order: the canonical form that is hashed.
export function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = sortKeysDeep(value[k]);
    return out;
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortKeysDeep(value));
}

// CRLF and LF checkouts of the same file must give the same hash.
export function normalizeLf(text) {
  return text.replace(/\r\n/g, "\n");
}

const sha256Hex = (text) => createHash("sha256").update(text, "utf8").digest("hex");

export function requestConfigSha256({
  systemPrompt, outputSchema, model, effort, maxTokens, schemaSource, parseSource, sdkVersion,
}) {
  return sha256Hex(canonicalJson({
    system_prompt: systemPrompt,
    output_schema: outputSchema,
    model,
    effort,
    max_tokens: maxTokens,
    schema_js: normalizeLf(schemaSource),
    parse_js: normalizeLf(parseSource),
    sdk_version: sdkVersion,
  }));
}

export function installedSdkVersion(serverDir = SERVER_DIR) {
  const pkg = JSON.parse(readFileSync(`${serverDir}/node_modules/@anthropic-ai/sdk/package.json`, "utf8"));
  return pkg.version;
}

// The hash for this server as it is built: the real schema, constants and source files.
export function currentRequestConfigSha256(systemPrompt, { srcDir = SRC_DIR, serverDir = SERVER_DIR } = {}) {
  return requestConfigSha256({
    systemPrompt,
    outputSchema: zodOutputFormat(ModelOutput).schema,
    model: MODEL,
    effort: REQUEST_EFFORT,
    maxTokens: MAX_OUTPUT_TOKENS,
    schemaSource: readFileSync(`${srcDir}schema.js`, "utf8"),
    parseSource: readFileSync(`${srcDir}parse.js`, "utf8"),
    sdkVersion: installedSdkVersion(serverDir),
  });
}
