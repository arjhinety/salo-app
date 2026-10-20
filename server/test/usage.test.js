// usage on every /parse body: copied from the model response when one exists, null otherwise. Mocked client, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { createApp } from "../src/server.js";
import { buildSystemPrompt } from "../src/prompt.js";
import { loadTuningRows } from "../src/tuning.js";

const SYSTEM = buildSystemPrompt(loadTuningRows());
const U = { input_tokens: 1234, output_tokens: 567, cache_creation_input_tokens: 0, cache_read_input_tokens: 890 };
const OK = { is_food_message: true, items: [{ food_item: "adobo", quantity: 3, unit: "tray" }], pickup_by: "20:00", missing: [] };
const mock = (impl) => ({ messages: { parse: async (args) => impl(args) } });
const model = (fields) => ({ content: [], ...fields });

function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}
async function call(client, { rateLimitPerMinute, raw } = {}) {
  const app = createApp({ client, keyConfigured: client !== null, systemPrompt: SYSTEM, rateLimitPerMinute });
  const { server, base } = await startServer(app);
  try {
    const res = await fetch(`${base}/parse`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: raw ?? JSON.stringify({ text: "may 3 trays adobo" }),
    });
    return { status: res.status, body: await res.json() };
  } finally {
    await new Promise((r) => server.close(r));
  }
}

test("200: usage is copied from the response (all four fields)", async () => {
  const r = await call(mock(() => model({ stop_reason: "end_turn", parsed_output: OK, usage: U })));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.usage, U);
});

test("200: a field the API omits is null; the others are copied", async () => {
  const r = await call(mock(() => model({ stop_reason: "end_turn", parsed_output: OK, usage: { input_tokens: 10, output_tokens: 5 } })));
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.usage, { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: null, cache_read_input_tokens: null });
});

test("200: a response with no usage object at all gives four nulls, not a missing field", async () => {
  const r = await call(mock(() => model({ stop_reason: "end_turn", parsed_output: OK })));
  assert.deepEqual(r.body.usage, { input_tokens: null, output_tokens: null, cache_creation_input_tokens: null, cache_read_input_tokens: null });
});

test("422 not_food_message: usage is present (the call was billed)", async () => {
  const r = await call(mock(() => model({ stop_reason: "end_turn", parsed_output: { ...OK, is_food_message: false, items: [] }, usage: U })));
  assert.equal(r.status, 422);
  assert.equal(r.body.error, "not_food_message");
  assert.deepEqual(r.body.usage, U);
});

test("503 model_output_rejected on refusal, on max_tokens, on null parsed output and on invalid output: usage is present each time", async () => {
  const cases = [
    model({ stop_reason: "refusal", parsed_output: null, usage: U }),
    model({ stop_reason: "max_tokens", parsed_output: null, usage: U }),
    model({ stop_reason: "end_turn", parsed_output: null, usage: U }),
    model({ stop_reason: "end_turn", parsed_output: { ...OK, pickup_by: "15:00" }, usage: U }),
  ];
  for (const c of cases) {
    const r = await call(mock(() => c));
    assert.equal(r.status, 503, JSON.stringify(c.stop_reason));
    assert.equal(r.body.error, "model_output_rejected");
    assert.deepEqual(r.body.usage, U);
  }
});

test("429 from Claude: usage is null (no model response)", async () => {
  const err = new Anthropic.RateLimitError(429, undefined, "x", new Headers());
  const r = await call(mock(() => { throw err; }));
  assert.equal(r.status, 429);
  assert.equal(r.body.usage, null);
});

test("503 model_unavailable (connection error): usage is null", async () => {
  const r = await call(mock(() => { throw new Anthropic.APIConnectionError({ message: "x" }); }));
  assert.equal(r.status, 503);
  assert.equal(r.body.error, "model_unavailable");
  assert.equal(r.body.usage, null);
});

test("no key configured (no client): 503 with usage null", async () => {
  const r = await call(null);
  assert.equal(r.status, 503);
  assert.equal(r.body.usage, null);
});

test("400 bad body and 413 text too long: usage is null", async () => {
  const bad = await call(mock(() => model({ stop_reason: "end_turn", parsed_output: OK, usage: U })), { raw: "not json" });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.usage, null);
  const long = await call(mock(() => model({ stop_reason: "end_turn", parsed_output: OK, usage: U })), { raw: JSON.stringify({ text: "x".repeat(501) }) });
  assert.equal(long.status, 413);
  assert.equal(long.body.usage, null);
});

test("local rate limit 429 (the server's own limit, before any model call): usage is null", async () => {
  const app = createApp({ client: mock(() => model({ stop_reason: "end_turn", parsed_output: OK, usage: U })), keyConfigured: true, systemPrompt: SYSTEM, rateLimitPerMinute: 1 });
  const { server, base } = await startServer(app);
  try {
    await fetch(`${base}/parse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "a" }) });
    const res = await fetch(`${base}/parse`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: "a" }) });
    assert.equal(res.status, 429);
    assert.equal((await res.json()).usage, null);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
