// error_kind on the proxy's 503 model_unavailable body: one test per SDK error class. No network; no key.
import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import { mapSdkError, errorKind, createParser } from "../src/parse.js";
import { buildSystemPrompt } from "../src/prompt.js";
import { loadTuningRows } from "../src/tuning.js";

const LEAK = "SECRET-SDK-MESSAGE-must-not-appear";
const H = () => new Headers();

const cases = [
  ["auth", () => new Anthropic.AuthenticationError(401, undefined, LEAK, H())],
  ["auth", () => new Anthropic.PermissionDeniedError(403, undefined, LEAK, H())],
  ["bad_request", () => new Anthropic.BadRequestError(400, undefined, LEAK, H())],
  ["bad_request", () => new Anthropic.NotFoundError(404, undefined, LEAK, H())],
  ["bad_request", () => new Anthropic.UnprocessableEntityError(422, undefined, LEAK, H())],
  ["timeout", () => new Anthropic.APIConnectionTimeoutError({ message: LEAK })],
  ["connection", () => new Anthropic.APIConnectionError({ message: LEAK })],
  ["server", () => new Anthropic.InternalServerError(500, undefined, LEAK, H())],
  ["server", () => new Anthropic.APIError(529, undefined, LEAK, H())],
  ["other", () => new Anthropic.APIError(418, undefined, LEAK, H())],
  ["other", () => new Error(LEAK)],
];

for (const [kind, make] of cases) {
  test(`error_kind "${kind}" for ${make().constructor.name}`, () => {
    const mapped = mapSdkError(make());
    assert.equal(mapped.status, 503);
    assert.equal(mapped.body.error, "model_unavailable");
    assert.equal(mapped.body.error_kind, kind);
    assert.equal(mapped.body.reason, "model unavailable");
    assert.ok(!JSON.stringify(mapped).includes(LEAK), "the SDK message is never echoed");
  });
}

test("a timeout is not reported as a plain connection error", () => {
  assert.equal(errorKind(new Anthropic.APIConnectionTimeoutError({ message: "t" })), "timeout");
  assert.equal(errorKind(new Anthropic.APIConnectionError({ message: "c" })), "connection");
});

test("rate limit keeps its 429 mapping and has no error_kind", () => {
  const mapped = mapSdkError(new Anthropic.RateLimitError(429, undefined, LEAK, H()));
  assert.equal(mapped.status, 429);
  assert.equal(mapped.body.error_kind, undefined);
});

test("no client (no key) answers 503 with error_kind no_client and makes no call", async () => {
  const parse = createParser({ client: null, systemPrompt: buildSystemPrompt(loadTuningRows()) });
  const r = await parse("x");
  assert.deepEqual(r, { status: 503, body: { error: "model_unavailable", reason: "model unavailable", error_kind: "no_client", usage: null } });
});
