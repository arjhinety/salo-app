// request_config_sha256: one hash of everything that defines a /parse request. Same recipe as the laptop proxy's
// requestConfig.js, adapted to this function: the inputs are the system prompt, the output JSON Schema (keys sorted),
// model, effort, max_tokens, the SDK version, and sha256 digests of the LF-normalised schema.ts and parse.ts.
// The digests come from buildInfo.ts (generated); the drift test checks them against the files. This hash is NOT the
// laptop proxy's hash: the code differs, so the value differs by design.
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { MAX_OUTPUT_TOKENS, MODEL, REQUEST_EFFORT, SDK_VERSION } from "./config.ts";
import { ModelOutput } from "./schema.ts";
import { PARSE_TS_LF_SHA256, SCHEMA_TS_LF_SHA256 } from "./buildInfo.ts";

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((value as Record<string, unknown>)[k]);
    }
    return out;
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeysDeep(value));
}

// CRLF and LF copies of the same text must give the same hash.
export function normalizeLf(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export async function sha256Text(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// sha256 of the LF-normalised text: the value embedded in buildInfo.ts for schema.ts and parse.ts.
export function lfSha256(text: string): Promise<string> {
  return sha256Text(normalizeLf(text));
}

export type RequestConfigInputs = {
  systemPrompt: string;
  outputSchema: unknown;
  model: string;
  effort: string;
  maxTokens: number;
  schemaLfSha256: string;
  parseLfSha256: string;
  sdkVersion: string;
};

export function requestConfigSha256(i: RequestConfigInputs): Promise<string> {
  return sha256Text(canonicalJson({
    system_prompt: i.systemPrompt,
    output_schema: i.outputSchema,
    model: i.model,
    effort: i.effort,
    max_tokens: i.maxTokens,
    schema_ts_lf_sha256: i.schemaLfSha256,
    parse_ts_lf_sha256: i.parseLfSha256,
    sdk_version: i.sdkVersion,
  }));
}

// The hash for this function as built: the real output schema plus the embedded source digests.
export function currentRequestConfigSha256(systemPrompt: string): Promise<string> {
  return requestConfigSha256({
    systemPrompt,
    outputSchema: zodOutputFormat(ModelOutput).schema,
    model: MODEL,
    effort: REQUEST_EFFORT,
    maxTokens: MAX_OUTPUT_TOKENS,
    schemaLfSha256: SCHEMA_TS_LF_SHA256,
    parseLfSha256: PARSE_TS_LF_SHA256,
    sdkVersion: SDK_VERSION,
  });
}
