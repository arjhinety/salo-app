// request_config_sha256: stable, CRLF-insensitive, changed by each input; the output schema equals the laptop proxy's
// (digest in buildInfo.ts); the embedded source digests equal the files on disk. No network.
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { assert, assertEquals, assertNotEquals, assertMatch } from "@std/assert";
import { ModelOutput } from "../schema.ts";
import { MAX_OUTPUT_TOKENS, MODEL, REQUEST_EFFORT, SDK_VERSION } from "../config.ts";
import { buildSystemPrompt } from "../prompt.ts";
import { canonicalJson, currentRequestConfigSha256, lfSha256, requestConfigSha256, sha256Text } from "../requestConfig.ts";
import { OUTPUT_SCHEMA_SHA256, PARSE_TS_LF_SHA256, SCHEMA_TS_LF_SHA256 } from "../buildInfo.ts";
import { checkRateLimit } from "../rateLimit.ts";
import { FakeStore, clock } from "./fakes.ts";

const SYSTEM = buildSystemPrompt();
const SCHEMA = zodOutputFormat(ModelOutput).schema;
const SCHEMA_SRC = Deno.readTextFileSync(new URL("../schema.ts", import.meta.url));
const PARSE_SRC = Deno.readTextFileSync(new URL("../parse.ts", import.meta.url));

const base = () => ({
  systemPrompt: SYSTEM,
  outputSchema: SCHEMA,
  model: MODEL,
  effort: REQUEST_EFFORT,
  maxTokens: MAX_OUTPUT_TOKENS,
  schemaLfSha256: SCHEMA_TS_LF_SHA256,
  parseLfSha256: PARSE_TS_LF_SHA256,
  sdkVersion: SDK_VERSION,
});
const H = (over: Partial<ReturnType<typeof base>> = {}) => requestConfigSha256({ ...base(), ...over });
const crlf = (t: string) => t.replace(/\r?\n/g, "\r\n");

Deno.test("the output schema equals the laptop proxy's (digest of canonical JSON, recorded at generation)", async () => {
  assertEquals(await sha256Text(canonicalJson(SCHEMA)), OUTPUT_SCHEMA_SHA256);
});

Deno.test("embedded source digests equal schema.ts and parse.ts on disk (LF-normalised)", async () => {
  assertEquals(await lfSha256(SCHEMA_SRC), SCHEMA_TS_LF_SHA256);
  assertEquals(await lfSha256(PARSE_SRC), PARSE_TS_LF_SHA256);
});

Deno.test("the hash is 64 hex characters, stable, and equal to the one from the embedded values", async () => {
  const h = await H();
  assertMatch(h, /^[0-9a-f]{64}$/);
  assertEquals(await H(), h);
  assertEquals(await currentRequestConfigSha256(SYSTEM), h);
});

Deno.test("CRLF and LF copies of schema and parse source give the same digest and hash", async () => {
  const h = await H();
  assertEquals(await lfSha256(crlf(SCHEMA_SRC)), await lfSha256(SCHEMA_SRC));
  assertEquals(await lfSha256(crlf(PARSE_SRC)), await lfSha256(PARSE_SRC));
  assertEquals(await H({ schemaLfSha256: await lfSha256(crlf(SCHEMA_SRC)), parseLfSha256: await lfSha256(crlf(PARSE_SRC)) }), h);
});

Deno.test("changing schema, model, effort, max_tokens, sdk version, the system prompt or the output schema changes the hash", async () => {
  const h = await H();
  const extended = JSON.parse(JSON.stringify(SCHEMA));
  extended.properties.extra_field = { type: "string" };
  assertNotEquals(await H({ outputSchema: extended }), h, "schema");
  assertNotEquals(await H({ model: "claude-haiku-5-6" }), h, "model");
  assertNotEquals(await H({ effort: "medium" }), h, "effort");
  assertNotEquals(await H({ maxTokens: MAX_OUTPUT_TOKENS + 1 }), h, "max_tokens");
  assertNotEquals(await H({ sdkVersion: "0.0.0-test" }), h, "sdk version");
  assertNotEquals(await H({ systemPrompt: SYSTEM + " " }), h, "system prompt");
});

Deno.test("changing schema or parse source by one character changes its digest and the hash", async () => {
  const h = await H();
  const schemaEdit = await lfSha256(SCHEMA_SRC + "\n// edit\n");
  const parseEdit = await lfSha256(PARSE_SRC + "\n// edit\n");
  assertNotEquals(schemaEdit, SCHEMA_TS_LF_SHA256);
  assertNotEquals(parseEdit, PARSE_TS_LF_SHA256);
  assertNotEquals(await H({ schemaLfSha256: schemaEdit }), h);
  assertNotEquals(await H({ parseLfSha256: parseEdit }), h);
});

Deno.test("canonical JSON sorts keys at every depth and keeps array order", () => {
  assertEquals(canonicalJson({ b: 1, a: { d: [{ z: 1, y: 2 }], c: 2 } }), '{"a":{"c":2,"d":[{"y":2,"z":1}]},"b":1}');
});

Deno.test("rate limit: an empty store allows", async () => {
  const c = clock(Date.parse("2026-10-26T10:00:00.000Z"));
  const store = new FakeStore(c.now);
  assertEquals(await checkRateLimit(store, "dev-A", c.now()), { allowed: true });
  assert(store.rows.length === 0);
});
