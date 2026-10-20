// HTTP behaviour with a mocked Anthropic client. No network; no key needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { createApp } from "../src/server.js";
import { buildSystemPrompt } from "../src/prompt.js";
import { loadTuningRows } from "../src/tuning.js";

const SYSTEM = buildSystemPrompt(loadTuningRows());
const FAKE_KEY = "sk-ant-TEST-ONLY-not-a-real-key";

function mockClient(impl) {
  const calls = [];
  return {
    calls,
    messages: {
      parse: async (args) => { calls.push(args); return impl(args); },
    },
  };
}

const okOut = {
  is_food_message: true,
  items: [
    { food_item: "adobo", quantity: 3, unit: "tray" },
    { food_item: "pandesal", quantity: 20, unit: "piece" },
  ],
  pickup_by: "20:00",
  missing: [],
};
const FAKE_USAGE = { input_tokens: 1000, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
const modelOk = (out, stop_reason = "end_turn") => ({ stop_reason, parsed_output: out, content: [], usage: FAKE_USAGE });

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

async function post(base, body, raw = false) {
  const res = await fetch(`${base}/parse`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ? body : JSON.stringify(body),
  });
  return { status: res.status, headers: res.headers, json: await res.json() };
}

async function withServer(t, client, opts = {}) {
  const app = createApp({ client, keyConfigured: true, systemPrompt: SYSTEM, ...opts });
  const ctx = await startServer(app);
  t.after(() => new Promise((r) => ctx.server.close(r)));
  return ctx;
}

test("200 happy path returns the exact output shape and sends the documented request", async (t) => {
  const client = mockClient(() => modelOk(okOut));
  const ctx = await withServer(t, client);
  const r = await post(ctx.base, { text: "may 3 trays adobo pa at 20 pandesal, kunin before 8" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, {
    items: [
      { food_item: "adobo", quantity: 3, unit: "tray" },
      { food_item: "pandesal", quantity: 20, unit: "piece" },
    ],
    pickup_by: "20:00",
    missing: [],
    source: "llm",
    model: "claude-haiku-5-5",
    usage: FAKE_USAGE,
  });
  const args = client.calls.at(-1);
  assert.equal(args.model, "claude-haiku-5-5");
  assert.equal(args.max_tokens, 2048);
  assert.equal(args.system, SYSTEM);
  assert.equal(args.output_config.effort, "low");
  assert.ok(args.output_config.format, "structured output format is sent");
  for (const banned of ["temperature", "top_p", "top_k", "thinking"]) assert.equal(args[banned], undefined);
  assert.deepEqual(args.messages, [{ role: "user", content: "may 3 trays adobo pa at 20 pandesal, kunin before 8" }]);
});

test("413 when the text is longer than 500 characters; the model is not called", async (t) => {
  const client = mockClient(() => modelOk(okOut));
  const ctx = await withServer(t, client);
  const r = await post(ctx.base, { text: "a".repeat(501) });
  assert.equal(r.status, 413);
  assert.equal(r.json.error, "text_too_long");
  assert.equal(client.calls.length, 0);
});

test("500 characters is accepted (boundary)", async (t) => {
  const client = mockClient(() => modelOk(okOut));
  const ctx = await withServer(t, client);
  const r = await post(ctx.base, { text: "a".repeat(500) });
  assert.equal(r.status, 200);
});

test("413 when the raw body is far too large", async (t) => {
  const client = mockClient(() => modelOk(okOut));
  const ctx = await withServer(t, client);
  const r = await post(ctx.base, `{"text":"${"x".repeat(20000)}"}`, true);
  assert.equal(r.status, 413);
  assert.equal(r.json.error, "body_too_large");
  assert.equal(client.calls.length, 0);
});

test("400 on bad bodies: not JSON, wrong shape, non-string text, empty text", async (t) => {
  const client = mockClient(() => modelOk(okOut));
  const ctx = await withServer(t, client);
  assert.equal((await post(ctx.base, "{not json", true)).status, 400);
  assert.equal((await post(ctx.base, "[1,2]", true)).status, 400);
  assert.equal((await post(ctx.base, { text: 42 })).status, 400);
  assert.equal((await post(ctx.base, {})).status, 400);
  assert.equal((await post(ctx.base, { text: "   " })).status, 400);
  assert.equal(client.calls.length, 0);
});

test("422 when the message is not a food offer, with a reason", async (t) => {
  const client = mockClient(() => modelOk({ is_food_message: false, items: [], pickup_by: null, missing: [] }));
  const ctx = await withServer(t, client);
  const r = await post(ctx.base, { text: "hello po, kumusta?" });
  assert.equal(r.status, 422);
  assert.equal(r.json.error, "not_food_message");
  assert.equal(typeof r.json.reason, "string");
  assert.ok(r.json.reason.length > 0);
});

test("503 on refusal and on max_tokens", async (t) => {
  const refusal = await withServer(t, mockClient(() => modelOk(null, "refusal")));
  assert.equal((await post(refusal.base, { text: "x" })).status, 503);
  const maxTok = await withServer(t, mockClient(() => modelOk(okOut, "max_tokens")));
  assert.equal((await post(maxTok.base, { text: "x" })).status, 503);
});

test("503 when parsing fails (parsed_output null) or the output does not match the schema", async (t) => {
  const nullParsed = await withServer(t, mockClient(() => modelOk(null)));
  assert.equal((await post(nullParsed.base, { text: "x" })).status, 503);
  const badUnit = await withServer(t, mockClient(() => modelOk({ ...okOut, items: [{ food_item: "x", quantity: 1, unit: "bundle" }] })));
  assert.equal((await post(badUnit.base, { text: "x" })).status, 503);
});

test("503 on invalid pickup times (outside 16:00-22:00, or not HH:MM)", async (t) => {
  for (const pickup_by of ["15:59", "22:01", "7:00", "25:00", "20:60", "8 PM"]) {
    const ctx = await withServer(t, mockClient(() => modelOk({ ...okOut, pickup_by })));
    const r = await post(ctx.base, { text: "x" });
    assert.equal(r.status, 503, `pickup ${pickup_by} should be rejected`);
  }
});

test("pickup at exactly 16:00 and 22:00 is accepted (boundary)", async (t) => {
  for (const pickup_by of ["16:00", "22:00", null]) {
    const ctx = await withServer(t, mockClient(() => modelOk({ ...okOut, pickup_by })));
    assert.equal((await post(ctx.base, { text: "x" })).status, 200, `pickup ${pickup_by}`);
  }
});

test("503 on invalid quantity or item count", async (t) => {
  const cases = [
    [{ food_item: "a", quantity: 0, unit: "tray" }],
    [{ food_item: "a", quantity: 501, unit: "tray" }],
    [{ food_item: "a", quantity: -2, unit: "tray" }],
    [],
    Array.from({ length: 11 }, (_, i) => ({ food_item: `f${i}`, quantity: 1, unit: null })),
  ];
  for (const items of cases) {
    const ctx = await withServer(t, mockClient(() => modelOk({ ...okOut, items })));
    assert.equal((await post(ctx.base, { text: "x" })).status, 503, JSON.stringify(items).slice(0, 60));
  }
});

test("429 when the SDK reports a rate limit", async (t) => {
  const err = new Anthropic.RateLimitError(429, undefined, "slow down", new Headers());
  const ctx = await withServer(t, mockClient(() => { throw err; }));
  const r = await post(ctx.base, { text: "x" });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "60");
});

test("503 'model unavailable' on auth error, connection error, and any other error", async (t) => {
  const errors = [
    new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers()),
    new Anthropic.APIConnectionError({ message: "offline" }),
    new Error("boom"),
  ];
  for (const err of errors) {
    const ctx = await withServer(t, mockClient(() => { throw err; }));
    const r = await post(ctx.base, { text: "x" });
    assert.equal(r.status, 503);
    assert.equal(r.json.reason, "model unavailable");
    assert.ok(!JSON.stringify(r.json).includes(FAKE_KEY));
  }
});

test("no key configured: /parse answers 503 without any call", async (t) => {
  const app = createApp({ client: null, keyConfigured: false, systemPrompt: SYSTEM });
  const { server, base } = await startServer(app);
  try {
    const r = await post(base, { text: "x" });
    assert.equal(r.status, 503);
    assert.equal(r.json.reason, "model unavailable");
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("health: ok, model, and key true/false; the key value is never returned", async (t) => {
  const withKey = await withServer(t, mockClient(() => modelOk(okOut)));
  const h1 = await fetch(`${withKey.base}/health`);
  const body1 = await h1.json();
  assert.deepEqual({ ...body1, prompt_sha256: undefined, request_config_sha256: undefined, git_commit: undefined, git_dirty: undefined },
    { ok: true, model: "claude-haiku-5-5", key: true, prompt_sha256: undefined, request_config_sha256: undefined, git_commit: undefined, git_dirty: undefined });
  assert.match(body1.prompt_sha256, /^[0-9a-f]{64}$/);

  const app = createApp({ client: null, keyConfigured: false, systemPrompt: SYSTEM });
  const { server, base } = await startServer(app);
  try {
    const res = await fetch(`${base}/health`);
    const text = await res.text();
    const body = JSON.parse(text);
    assert.deepEqual([body.ok, body.model, body.key, body.git_commit, body.git_dirty], [true, "claude-haiku-5-5", false, null, null]);
    assert.match(body.prompt_sha256, /^[0-9a-f]{64}$/);
    assert.ok(!text.includes(FAKE_KEY));
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("local rate limit: the 31st request in a minute gets 429 with Retry-After", async (t) => {
  const client = mockClient(() => modelOk(okOut));
  const ctx = await withServer(t, client, { rateLimitPerMinute: 30, now: () => 1_000_000 });
  for (let i = 0; i < 30; i++) {
    assert.equal((await post(ctx.base, { text: "x" })).status, 200, `request ${i + 1}`);
  }
  const r = await post(ctx.base, { text: "x" });
  assert.equal(r.status, 429);
  assert.equal(r.json.error, "rate_limited");
  assert.ok(Number(r.headers.get("retry-after")) >= 1);
  assert.equal(client.calls.length, 30);
});

test("unknown path is 404; wrong method is 405", async (t) => {
  const ctx = await withServer(t, mockClient(() => modelOk(okOut)));
  assert.equal((await fetch(`${ctx.base}/nope`)).status, 404);
  assert.equal((await fetch(`${ctx.base}/parse`)).status, 405);
  assert.equal((await fetch(`${ctx.base}/health`, { method: "POST" })).status, 405);
});
