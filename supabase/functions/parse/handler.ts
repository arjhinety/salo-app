// The request handler: the HTTP contract of the laptop proxy (server/src/server.js), plus auth, per-device and global
// rate limits, and one parse_requests row per parse request. Pure over its inputs (store, parser, clock), so the Deno
// tests run it with an in-memory store and a mocked Anthropic client.
import { LOCAL_RATE_LIMIT_KIND, type RequestRow, type RequestStore } from "./requestStore.ts";
import { checkRateLimit } from "./rateLimit.ts";
import { MAX_BODY_BYTES, MAX_TEXT_CHARS, MODEL } from "./config.ts";
import type { ParseResult } from "./parse.ts";

export interface HandlerConfig {
  parse: (text: string) => Promise<ParseResult>;
  keyConfigured: boolean;
  promptSha256: string;
  requestConfigSha256: string;
  sdkVersion: string;
  model?: string;
  now?: () => number;
  onLogError?: (message: string) => void;
}

export interface HandlerInput {
  userId: string | null; // the verified Supabase user id (anonymous users included); null when unauthenticated
  store: RequestStore;
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });

// Every parse-path body carries usage: the model's usage when a model response exists, null otherwise.
const parseBody = (status: number, body: Record<string, unknown>, headers: Record<string, string> = {}) =>
  json(status, { ...body, usage: body.usage ?? null }, headers);

export function createHandler(config: HandlerConfig) {
  const model = config.model ?? MODEL;
  const now = config.now ?? (() => Date.now());
  const logError = config.onLogError ?? ((m: string) => console.error(m));

  // Records one row. A failed insert is logged (code only, never the content) and does not change the answer.
  async function record(store: RequestStore, row: RequestRow): Promise<void> {
    try {
      await store.insert(row);
    } catch (err) {
      logError(err instanceof Error ? err.message : "parse_requests insert failed");
    }
  }

  function health(): Response {
    return json(200, {
      ok: true,
      model,
      key: config.keyConfigured,
      prompt_sha256: config.promptSha256,
      request_config_sha256: config.requestConfigSha256,
      sdk_version: config.sdkVersion,
    });
  }

  return async function handle(req: Request, input: HandlerInput): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === "GET" && (url.pathname.endsWith("/health") || url.searchParams.get("health") === "1")) {
      if (input.userId === null) return json(401, { error: "unauthorized", reason: "sign in required", usage: null });
      return health();
    }
    if (req.method !== "POST") return json(405, { error: "method_not_allowed", usage: null }, { Allow: "POST, GET" });
    // No row for 401 or 403: parse_requests.device_id must reference a registered devices row, so there is no device to log.
    if (input.userId === null) return json(401, { error: "unauthorized", reason: "sign in required", usage: null });
    const deviceId = input.userId;
    if (!(await input.store.deviceRegistered(deviceId))) {
      return json(403, { error: "device_not_registered", reason: "register this device before parsing", usage: null });
    }

    const started = now();

    // 1. Body size and shape. These answers never reach the model and do not count toward the rate limits.
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) {
      return finish(input, deviceId, "", started, 413, { error: "body_too_large", reason: "request body too large", usage: null }, { Connection: "close" });
    }
    let raw: string;
    try {
      raw = await req.text();
    } catch {
      return finish(input, deviceId, "", started, 400, { error: "bad_request", reason: "unreadable body", usage: null });
    }
    if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
      return finish(input, deviceId, "", started, 413, { error: "body_too_large", reason: "request body too large", usage: null }, { Connection: "close" });
    }
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      return finish(input, deviceId, "", started, 400, { error: "bad_request", reason: "body is not JSON", usage: null });
    }
    if (!parsedJson || typeof parsedJson !== "object" || Array.isArray(parsedJson)
      || typeof (parsedJson as { text?: unknown }).text !== "string") {
      return finish(input, deviceId, "", started, 400, { error: "bad_request", reason: 'body must be {"text": string}', usage: null });
    }
    const text = (parsedJson as { text: string }).text;
    if (text.trim() === "") {
      return finish(input, deviceId, "", started, 400, { error: "bad_request", reason: "text is empty", usage: null });
    }
    if ([...text].length > MAX_TEXT_CHARS) {
      return finish(input, deviceId, "", started, 413, { error: "text_too_long", reason: `text is longer than ${MAX_TEXT_CHARS} characters`, usage: null });
    }

    // 2. Rate limits, before any model call. Our own 429 is logged with error_kind local_rate_limit (not counted).
    const limit = await checkRateLimit(input.store, deviceId, now());
    if (!limit.allowed) {
      return finish(
        input, deviceId, text, started, 429,
        { error: "rate_limited", reason: "too many requests", usage: null },
        { "Retry-After": String(limit.retryAfterSec) },
        LOCAL_RATE_LIMIT_KIND,
      );
    }

    // 3. The model call (or the no-key 503 inside the parser). Every body from here carries usage.
    const result = await config.parse(text);
    const retry: Record<string, string> = result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {};
    const errorKind = result.status === 200 ? null : (result.body.error_kind ?? result.body.error ?? null);
    return finish(input, deviceId, text, started, result.status, { ...result.body }, retry, errorKind ?? undefined);
  };

  // Writes the row and answers. text is stored only when it is an accepted-size request text; otherwise "" (never a 413 payload).
  async function finish(
    input: HandlerInput,
    deviceId: string,
    text: string,
    started: number,
    status: number,
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
    errorKindOverride?: string,
  ): Promise<Response> {
    const usage = (body.usage ?? null) as unknown;
    const errorKind = errorKindOverride ?? (status === 200 ? null : (typeof body.error === "string" ? body.error : null));
    const row = rowOf(deviceId, text, status, { ...body, usage: usage ?? null }, errorKind, config, now() - started, usage !== null ? model : null);
    await record(input.store, row);
    return parseBody(status, body, headers);
  }
}

function rowOf(
  deviceId: string,
  text: string,
  status: number,
  body: Record<string, unknown>,
  errorKind: string | null,
  config: HandlerConfig,
  latencyMs: number,
  model: string | null = null,
): RequestRow {
  return {
    device_id: deviceId,
    text,
    http_status: status,
    response: body,
    usage: body.usage ?? null,
    error_kind: errorKind,
    model,
    request_config_sha256: config.requestConfigSha256,
    latency_ms: Math.max(0, Math.round(latencyMs)),
  };
}
