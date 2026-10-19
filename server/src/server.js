// Laptop LLM proxy: POST /parse and GET /health. Node built-ins, the Anthropic SDK and zod.
import http from "node:http";
import os from "node:os";
import { pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import {
  MODEL, SDK_TIMEOUT_MS, SDK_MAX_RETRIES, MAX_TEXT_CHARS, MAX_BODY_BYTES,
  RATE_LIMIT_PER_MINUTE, loadEnvFile, readPort,
} from "./config.js";
import { createRateLimiter } from "./rateLimit.js";
import { createParser } from "./parse.js";
import { buildSystemPrompt } from "./prompt.js";
import { loadTuningRows } from "./tuning.js";

function send(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

// Resolves { raw } on success, { tooLarge } above the limit, or { error } on a stream error.
function readBody(req, limit) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;
    let done = false;
    req.on("data", (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) { done = true; resolve({ tooLarge: true }); req.resume(); return; }
      chunks.push(c);
    });
    req.on("end", () => { if (!done) { done = true; resolve({ raw: Buffer.concat(chunks).toString("utf8") }); } });
    req.on("error", () => { if (!done) { done = true; resolve({ error: true }); } });
  });
}

// client: an Anthropic SDK client, or null when no key is configured (then /parse answers 503 without calling anything).
export function createApp({
  client,
  keyConfigured,
  systemPrompt,
  model = MODEL,
  rateLimitPerMinute = RATE_LIMIT_PER_MINUTE,
  now = () => Date.now(),
}) {
  const parse = createParser({ client, systemPrompt, model });
  const takeRateToken = createRateLimiter({ limit: rateLimitPerMinute, now });

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    try {
      if (url.pathname === "/health") {
        if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
        return send(res, 200, { ok: true, model, key: Boolean(keyConfigured) });
      }
      if (url.pathname !== "/parse") return send(res, 404, { error: "not_found" });
      if (req.method !== "POST") return send(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });

      const limit = takeRateToken();
      if (!limit.allowed) {
        res.setHeader("Connection", "close");
        return send(res, 429, { error: "rate_limited", reason: "too many requests" }, { "Retry-After": String(limit.retryAfterSec) });
      }

      const body = await readBody(req, MAX_BODY_BYTES);
      if (body.tooLarge) {
        res.setHeader("Connection", "close");
        return send(res, 413, { error: "body_too_large", reason: "request body too large" });
      }
      if (body.error) return send(res, 400, { error: "bad_request", reason: "unreadable body" });

      let json;
      try { json = JSON.parse(body.raw); } catch { return send(res, 400, { error: "bad_request", reason: "body is not JSON" }); }
      if (!json || typeof json !== "object" || Array.isArray(json) || typeof json.text !== "string") {
        return send(res, 400, { error: "bad_request", reason: 'body must be {"text": string}' });
      }
      if (json.text.trim() === "") return send(res, 400, { error: "bad_request", reason: "text is empty" });
      if ([...json.text].length > MAX_TEXT_CHARS) {
        return send(res, 413, { error: "text_too_long", reason: `text is longer than ${MAX_TEXT_CHARS} characters` });
      }

      const result = await parse(json.text);
      return send(res, result.status, result.body, result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {});
    } catch {
      // Internal details are never echoed.
      if (!res.headersSent) send(res, 500, { error: "internal_error", reason: "internal error" });
    }
  });
}

export function lanAddresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) out.push(i.address);
    }
  }
  return out;
}

async function main() {
  loadEnvFile();
  const port = readPort();
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim() || "";
  const keyConfigured = apiKey !== "";
  const systemPrompt = buildSystemPrompt(loadTuningRows());
  const client = keyConfigured
    ? new Anthropic({ apiKey, timeout: SDK_TIMEOUT_MS, maxRetries: SDK_MAX_RETRIES })
    : null;

  const server = createApp({ client, keyConfigured, systemPrompt });
  server.listen(port, "0.0.0.0", () => {
    console.log(`Salo LLM proxy on port ${port} (model ${MODEL}).`);
    console.log(keyConfigured
      ? "API key: configured (never printed)."
      : "API key: NOT SET. /parse answers 503 until server/.env has ANTHROPIC_API_KEY.");
    for (const ip of lanAddresses()) console.log(`LAN address: http://${ip}:${port}`);
    console.log(`Rate limit: ${RATE_LIMIT_PER_MINUTE} requests per minute, all callers. No auth yet: anyone on this Wi-Fi can call it.`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`Startup failed: ${err.message}`);
    process.exit(1);
  });
}
