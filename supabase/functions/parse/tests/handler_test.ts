// HTTP behaviour of the parse handler with a mocked Anthropic client and an in-memory parse_requests store. No network.
import Anthropic from "@anthropic-ai/sdk";
import { assert, assertEquals, assertStrictEquals } from "@std/assert";
import { createHandler } from "../handler.ts";
import { createParser } from "../parse.ts";
import { buildSystemPrompt } from "../prompt.ts";
import { currentRequestConfigSha256 } from "../requestConfig.ts";
import { SDK_VERSION } from "../config.ts";
import { clock, FAKE_KEY, FakeStore, fakeClient, modelOk, OK_OUT } from "./fakes.ts";

const SYSTEM = buildSystemPrompt();
const CONFIG_SHA = await currentRequestConfigSha256(SYSTEM);
const PROMPT_SHA = await (async () => {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(SYSTEM));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
})();
const T0 = Date.parse("2026-10-26T10:00:00.000Z");
const URL_PARSE = "https://test.supabase.co/functions/v1/parse";

function setup(opts: { client?: ReturnType<typeof fakeClient> | null; keyConfigured?: boolean } = {}) {
  const c = clock(T0);
  const store = new FakeStore(c.now);
  const client = opts.client === undefined ? fakeClient(() => modelOk(OK_OUT)) : opts.client;
  const handle = createHandler({
    parse: createParser({ client, systemPrompt: SYSTEM }),
    keyConfigured: opts.keyConfigured ?? client !== null,
    promptSha256: PROMPT_SHA,
    requestConfigSha256: CONFIG_SHA,
    sdkVersion: SDK_VERSION,
    now: c.now,
    onLogError: () => {},
  });
  return { handle, store, client, clock: c };
}

const post = (body: unknown, raw = false) =>
  new Request(URL_PARSE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  });
const call = async (h: ReturnType<typeof setup>, req: Request, userId: string | null = "dev-A") => {
  const res = await h.handle(req, { userId, store: h.store });
  const text = await res.text();
  return { status: res.status, headers: res.headers, text, json: text ? JSON.parse(text) : null };
};

Deno.test("200: exact output shape, usage, and the documented request to the model", async () => {
  const h = setup();
  const r = await call(h, post({ text: "may 3 trays adobo pa at 20 pandesal, kunin before 8" }));
  assertStrictEquals(r.status, 200);
  assertEquals(r.json, {
    items: [
      { food_item: "adobo", quantity: 3, unit: "tray" },
      { food_item: "pandesal", quantity: 20, unit: "piece" },
    ],
    pickup_by: "20:00",
    missing: [],
    source: "llm",
    model: "claude-haiku-5-5",
    usage: { input_tokens: 1000, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
  });
  const args = h.client!.calls.at(-1);
  assertEquals(args.model, "claude-haiku-5-5");
  assertEquals(args.max_tokens, 2048);
  assertEquals(args.system, SYSTEM);
  assertEquals(args.output_config.effort, "low");
  assert(args.output_config.format, "structured output format is sent");
  for (const banned of ["temperature", "top_p", "top_k", "thinking"]) assertStrictEquals(args[banned], undefined);
  assertEquals(args.messages, [{ role: "user", content: "may 3 trays adobo pa at 20 pandesal, kunin before 8" }]);
});

Deno.test("200: one row, status 200, usage and model recorded, request_config hash stored", async () => {
  const h = setup();
  await call(h, post({ text: "x" }));
  assertEquals(h.store.rows.length, 1);
  const row = h.store.rows[0];
  assertEquals(row.http_status, 200);
  assertEquals(row.device_id, "dev-A");
  assertEquals(row.text, "x");
  assertEquals(row.model, "claude-haiku-5-5");
  assertEquals(row.error_kind, null);
  assertEquals(row.request_config_sha256, CONFIG_SHA);
  assertEquals((row.usage as { output_tokens: number }).output_tokens, 80);
  assert(row.latency_ms >= 0);
});

Deno.test("413 over 500 characters (boundary 500 accepted); the model is not called; the row keeps no text", async () => {
  const h = setup();
  const r = await call(h, post({ text: "a".repeat(501) }));
  assertStrictEquals(r.status, 413);
  assertEquals(r.json.error, "text_too_long");
  assertEquals(h.client!.calls.length, 0);
  assertEquals(h.store.rows[0].text, "");
  const ok = await call(h, post({ text: "a".repeat(500) }));
  assertStrictEquals(ok.status, 200);
});

Deno.test("413 when the raw body is over 8 KB", async () => {
  const h = setup();
  const r = await call(h, post(`{"text":"${"x".repeat(20000)}"}`, true));
  assertStrictEquals(r.status, 413);
  assertEquals(r.json.error, "body_too_large");
  assertEquals(h.client!.calls.length, 0);
});

Deno.test("400 on bad bodies: not JSON, array, non-string text, empty object, blank text", async () => {
  const h = setup();
  for (const raw of ["{not json", "[1,2]"]) assertStrictEquals((await call(h, post(raw, true))).status, 400);
  assertStrictEquals((await call(h, post({ text: 42 }))).status, 400);
  assertStrictEquals((await call(h, post({}))).status, 400);
  assertStrictEquals((await call(h, post({ text: "   " }))).status, 400);
  assertEquals(h.client!.calls.length, 0);
  assertEquals(h.store.rows.map((r) => r.http_status), [400, 400, 400, 400, 400]);
});

Deno.test("422 not_food_message with a reason; usage present", async () => {
  const h = setup({ client: fakeClient(() => modelOk({ is_food_message: false, items: [], pickup_by: null, missing: [] })) });
  const r = await call(h, post({ text: "hello po, kumusta?" }));
  assertStrictEquals(r.status, 422);
  assertEquals(r.json.error, "not_food_message");
  assert(typeof r.json.reason === "string" && r.json.reason.length > 0);
  assert(r.json.usage !== null);
  assertEquals(h.store.rows[0].error_kind, "not_food_message");
});

Deno.test("503 model_output_rejected on refusal, max_tokens, null parsed_output, and schema-invalid output", async () => {
  const cases: [unknown, string][] = [
    [modelOk(null, "refusal"), "refusal"],
    [modelOk(OK_OUT, "max_tokens"), "max_tokens"],
    [modelOk(null), "null parsed"],
    [modelOk({ ...OK_OUT, items: [{ food_item: "x", quantity: 1, unit: "bundle" }] }), "bad unit"],
  ];
  for (const [resp, label] of cases) {
    const h = setup({ client: fakeClient(() => resp) });
    const r = await call(h, post({ text: "x" }));
    assertStrictEquals(r.status, 503, label);
    assertEquals(r.json.error, "model_output_rejected", label);
    assert(r.json.usage !== null, `${label} carries usage`);
    assertEquals(h.store.rows[0].error_kind, "model_output_rejected", label);
  }
});

Deno.test("503 on invalid pickup times and invalid quantity or item counts; boundaries 16:00 and 22:00 accepted", async () => {
  for (const pickup_by of ["15:59", "22:01", "7:00", "25:00", "20:60", "8 PM"]) {
    const h = setup({ client: fakeClient(() => modelOk({ ...OK_OUT, pickup_by })) });
    assertStrictEquals((await call(h, post({ text: "x" }))).status, 503, pickup_by);
  }
  for (const pickup_by of ["16:00", "22:00", null]) {
    const h = setup({ client: fakeClient(() => modelOk({ ...OK_OUT, pickup_by })) });
    assertStrictEquals((await call(h, post({ text: "x" }))).status, 200, String(pickup_by));
  }
  const badItems: unknown[][] = [
    [{ food_item: "a", quantity: 0, unit: "tray" }],
    [{ food_item: "a", quantity: 501, unit: "tray" }],
    [{ food_item: "a", quantity: -2, unit: "tray" }],
    [],
    Array.from({ length: 11 }, (_, i) => ({ food_item: `f${i}`, quantity: 1, unit: null })),
  ];
  for (const items of badItems) {
    const h = setup({ client: fakeClient(() => modelOk({ ...OK_OUT, items })) });
    assertStrictEquals((await call(h, post({ text: "x" }))).status, 503, JSON.stringify(items).slice(0, 60));
  }
});

Deno.test("error_kind mapping: each SDK error gives 503 model_unavailable with the documented kind; no message echoed", async () => {
  const cases: [Error, string][] = [
    [new Anthropic.AuthenticationError(401, undefined, "bad key " + FAKE_KEY, new Headers()), "auth"],
    [new Anthropic.BadRequestError(400, undefined, "bad", new Headers()), "bad_request"],
    [new Anthropic.APIConnectionTimeoutError({ message: "timed out" }), "timeout"],
    [new Anthropic.APIConnectionError({ message: "offline" }), "connection"],
    [new Anthropic.InternalServerError(500, undefined, "down", new Headers()), "server"],
    [new Error("boom"), "other"],
  ];
  for (const [err, kind] of cases) {
    const h = setup({ client: fakeClient(() => { throw err; }) });
    const r = await call(h, post({ text: "x" }));
    assertStrictEquals(r.status, 503, kind);
    assertEquals(r.json.error, "model_unavailable", kind);
    assertEquals(r.json.reason, "model unavailable", kind);
    assertEquals(r.json.error_kind, kind);
    assert(!r.text.includes(FAKE_KEY), `${kind}: key must not appear`);
    assertEquals(h.store.rows[0].error_kind, kind);
    assertEquals(h.store.rows[0].http_status, 503);
  }
});

Deno.test("429 from the model: Retry-After 60, reason model rate limit, row counted as rate_limited", async () => {
  const h = setup({ client: fakeClient(() => { throw new Anthropic.RateLimitError(429, undefined, "slow", new Headers()); }) });
  const r = await call(h, post({ text: "x" }));
  assertStrictEquals(r.status, 429);
  assertEquals(r.headers.get("retry-after"), "60");
  assertEquals(r.json.error, "rate_limited");
  assertEquals(h.store.rows[0].error_kind, "rate_limited");
});

Deno.test("no key configured: 503 no_client, the model is never called, one row", async () => {
  const h = setup({ client: null, keyConfigured: false });
  const r = await call(h, post({ text: "x" }));
  assertStrictEquals(r.status, 503);
  assertEquals(r.json.error_kind, "no_client");
  assertEquals(r.json.reason, "model unavailable");
  assertEquals(r.json.usage, null);
  assertEquals(h.store.rows.length, 1);
  assertEquals(h.store.rows[0].error_kind, "no_client");
});

Deno.test("per-device limit: the 11th request in 60 s is 429 with Retry-After from the oldest row; the window slides", async () => {
  const h = setup();
  for (let i = 0; i < 10; i++) assertStrictEquals((await call(h, post({ text: "x" }))).status, 200, `request ${i + 1}`);
  const blocked = await call(h, post({ text: "x" }));
  assertStrictEquals(blocked.status, 429);
  assertEquals(blocked.headers.get("retry-after"), "60");
  assertEquals(blocked.json.error, "rate_limited");
  assertEquals(h.client!.calls.length, 10, "no model call for the blocked request");

  // 20 s later the oldest 10 are still in the window, so Retry-After counts down from the first row.
  h.clock.advance(20_000);
  const again = await call(h, post({ text: "x" }));
  assertStrictEquals(again.status, 429);
  assertEquals(again.headers.get("retry-after"), "40");

  // Local 429s are not counted, so after the window passes the device is allowed again.
  h.clock.advance(41_000);
  assertStrictEquals((await call(h, post({ text: "x" }))).status, 200);
});

Deno.test("other devices are not limited by one device's per-device limit", async () => {
  const h = setup();
  for (let i = 0; i < 10; i++) await call(h, post({ text: "x" }), "dev-A");
  assertStrictEquals((await call(h, post({ text: "x" }), "dev-A")).status, 429);
  assertStrictEquals((await call(h, post({ text: "x" }), "dev-B")).status, 200);
});

Deno.test("global limit: the 31st counted request in 60 s from any devices is 429 (scope global), Retry-After from the oldest", async () => {
  const h = setup();
  for (let i = 0; i < 30; i++) {
    assertStrictEquals((await call(h, post({ text: "x" }), `dev-${i}`)).status, 200, `request ${i + 1}`);
  }
  const r = await call(h, post({ text: "x" }), "dev-new");
  assertStrictEquals(r.status, 429);
  assertEquals(r.headers.get("retry-after"), "60");
  assertEquals(h.client!.calls.length, 30);
  const localRow = h.store.rows.at(-1)!;
  assertEquals(localRow.error_kind, "local_rate_limit");
  assertEquals(localRow.http_status, 429);
});

Deno.test("requests refused by the local limit are not counted, so they do not extend the lock", async () => {
  const h = setup();
  for (let i = 0; i < 10; i++) await call(h, post({ text: "x" }));
  for (let i = 0; i < 5; i++) assertStrictEquals((await call(h, post({ text: "x" }))).status, 429);
  h.clock.advance(60_000);
  assertStrictEquals((await call(h, post({ text: "x" }))).status, 200, "allowed as soon as the first window expires");
});

Deno.test("a row is inserted for every parse request outcome, and 400/413 rows keep no text", async () => {
  const h = setup({ client: fakeClient((args) => {
    const t = args.messages[0].content;
    if (t === "refuse") return modelOk(null, "refusal");
    if (t === "hello") return modelOk({ is_food_message: false, items: [], pickup_by: null, missing: [] });
    return modelOk(OK_OUT);
  }) });
  await call(h, post({ text: "ok" }));
  await call(h, post({ text: "refuse" }));
  await call(h, post({ text: "hello" }));
  await call(h, post({ text: "a".repeat(501) }));
  await call(h, post("{bad", true));
  assertEquals(h.store.rows.map((r) => r.http_status), [200, 503, 422, 413, 400]);
  assertEquals(h.store.rows.map((r) => r.text), ["ok", "refuse", "hello", "", ""]);
});

Deno.test("a failed insert is logged without content and does not change the answer", async () => {
  const logged: string[] = [];
  const h = setup();
  h.store.failInsert = true;
  const handle = createHandler({
    parse: createParser({ client: h.client, systemPrompt: SYSTEM }),
    keyConfigured: true,
    promptSha256: PROMPT_SHA,
    requestConfigSha256: CONFIG_SHA,
    sdkVersion: SDK_VERSION,
    now: h.clock.now,
    onLogError: (m) => logged.push(m),
  });
  const res = await handle(post({ text: "x" }), { userId: "dev-A", store: h.store });
  assertStrictEquals(res.status, 200);
  assertEquals(logged, ["parse_requests insert failed: 42501"]);
  assert(!logged.join("").includes("x"), "the donor text is not logged");
});

Deno.test("unauthenticated (no user id) is 401; no model call; no row (there is no device to log)", async () => {
  const h = setup();
  const r = await call(h, post({ text: "x" }), null);
  assertStrictEquals(r.status, 401);
  assertEquals(r.json.error, "unauthorized");
  assertEquals(h.client!.calls.length, 0);
  assertEquals(h.store.rows.length, 0);
});

Deno.test("unregistered device (no devices row) is 403 device_not_registered before any model call; no row", async () => {
  const h = setup();
  h.store.unregistered.add("dev-ghost");
  const r = await call(h, post({ text: "x" }), "dev-ghost");
  assertStrictEquals(r.status, 403);
  assertEquals(r.json.error, "device_not_registered");
  assertEquals(h.client!.calls.length, 0);
  assertEquals(h.store.rows.length, 0);
});

Deno.test("health: ok, model, key false when no key, hashes present, never a key value; works with ?health=1", async () => {
  const h = setup({ client: null, keyConfigured: false });
  const res = await h.handle(new Request(`${URL_PARSE}/health`, { method: "GET" }), { userId: "dev-A", store: h.store });
  const text = await res.text();
  const body = JSON.parse(text);
  assertEquals(body, {
    ok: true,
    model: "claude-haiku-5-5",
    key: false,
    prompt_sha256: PROMPT_SHA,
    request_config_sha256: CONFIG_SHA,
    sdk_version: "0.135.0",
  });
  assert(!text.includes("sk-ant"));
  assertEquals(h.store.rows.length, 0, "health is not a parse request and writes no row");

  const withKey = setup();
  const res2 = await withKey.handle(new Request(`${URL_PARSE}?health=1`, { method: "GET" }), { userId: "dev-A", store: withKey.store });
  assertEquals((await res2.json()).key, true);
});

Deno.test("health without a user is 401; wrong method on parse is 405", async () => {
  const h = setup();
  const r1 = await h.handle(new Request(`${URL_PARSE}/health`), { userId: null, store: h.store });
  assertStrictEquals(r1.status, 401);
  const r2 = await h.handle(new Request(URL_PARSE, { method: "PUT" }), { userId: "dev-A", store: h.store });
  assertStrictEquals(r2.status, 405);
});

Deno.test("the response never contains the key, even when the SDK error message would", async () => {
  const h = setup({ client: fakeClient(() => { throw new Anthropic.AuthenticationError(401, undefined, FAKE_KEY, new Headers()); }) });
  const r = await call(h, post({ text: "x" }));
  assert(!r.text.includes(FAKE_KEY));
  assert(!JSON.stringify(h.store.rows).includes(FAKE_KEY));
});
