// Laptop LLM proxy: POST /parse and GET /health. Node built-ins, the Anthropic SDK and zod.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import http from "node:http";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import {
  MODEL, SDK_TIMEOUT_MS, MAX_TEXT_CHARS, MAX_BODY_BYTES,
  RATE_LIMIT_PER_MINUTE, loadEnvFile, readPort, readSdkMaxRetries,
} from "./config.js";
import { createRateLimiter } from "./rateLimit.js";
import { createParser } from "./parse.js";
import { buildSystemPrompt } from "./prompt.js";
import { loadTuningRows } from "./tuning.js";
import { currentRequestConfigSha256 } from "./requestConfig.js";

function send(res, status, body, extraHeaders = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders,
  });
  res.end(payload);
}

// Every /parse body carries usage: the model's usage when a model response exists, null otherwise (429, 503 model_unavailable, 400, 413).
function sendParse(res, status, body, extraHeaders = {}) {
  return send(res, status, { ...body, usage: body.usage ?? null }, extraHeaders);
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

// The SDK client for /parse. maxRetries comes from SALO_SDK_MAX_RETRIES (see readSdkMaxRetries). No network call is made here.
export function createModelClient({ apiKey, maxRetries, timeoutMs = SDK_TIMEOUT_MS }) {
  return new Anthropic({ apiKey, timeout: timeoutMs, maxRetries });
}

export const SERVER_DIR = fileURLToPath(new URL("..", import.meta.url));

// Build identity for /health, read once at startup. Null means unknown (no git, or the command failed).
// git_dirty is scoped to the server directory (`git status --porcelain -- .`), so other agents' changes elsewhere
// in the repository do not make the server look dirty.
export function readBuildInfo(dir = SERVER_DIR, exec = execFileSync) {
  const run = (args) => exec("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
  let gitCommit = null;
  let gitDirty = null;
  try {
    const sha = run(["rev-parse", "HEAD"]).trim();
    if (/^[0-9a-f]{40}$/.test(sha)) gitCommit = sha;
  } catch {
    gitCommit = null;
  }
  try {
    gitDirty = run(["status", "--porcelain", "--", "."]).trim() !== "";
  } catch {
    gitDirty = null;
  }
  return { gitCommit, gitDirty };
}

// client: an Anthropic SDK client, or null when no key is configured (then /parse answers 503 without calling anything).
// build: { gitCommit, gitDirty } from readBuildInfo (null when not supplied). The key is never part of /health.
export function createApp({
  client,
  keyConfigured,
  systemPrompt,
  model = MODEL,
  rateLimitPerMinute = RATE_LIMIT_PER_MINUTE,
  now = () => Date.now(),
  build = { gitCommit: null, gitDirty: null },
}) {
  const parse = createParser({ client, systemPrompt, model });
  const takeRateToken = createRateLimiter({ limit: rateLimitPerMinute, now });
  // The sha256 of the exact bytes sent to the model as the system prompt (UTF-8), computed once.
  const promptSha256 = createHash("sha256").update(systemPrompt, "utf8").digest("hex");
  // request_config_sha256: everything that defines the /parse request (src/requestConfig.js), computed once.
  const requestConfigHash = currentRequestConfigSha256(systemPrompt);

  return http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://local");
    try {
      if (url.pathname === "/health") {
        if (req.method !== "GET") return send(res, 405, { error: "method_not_allowed" }, { Allow: "GET" });
        return send(res, 200, {
          ok: true,
          model,
          key: Boolean(keyConfigured),
          prompt_sha256: promptSha256,
          request_config_sha256: requestConfigHash,
          git_commit: build.gitCommit ?? null,
          git_dirty: build.gitDirty ?? null,
        });
      }
      if (url.pathname !== "/parse") return sendParse(res, 404, { error: "not_found" });
      if (req.method !== "POST") return sendParse(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });

      const limit = takeRateToken();
      if (!limit.allowed) {
        res.setHeader("Connection", "close");
        return sendParse(res, 429, { error: "rate_limited", reason: "too many requests" }, { "Retry-After": String(limit.retryAfterSec) });
      }

      const body = await readBody(req, MAX_BODY_BYTES);
      if (body.tooLarge) {
        res.setHeader("Connection", "close");
        return sendParse(res, 413, { error: "body_too_large", reason: "request body too large" });
      }
      if (body.error) return sendParse(res, 400, { error: "bad_request", reason: "unreadable body" });

      let json;
      try { json = JSON.parse(body.raw); } catch { return sendParse(res, 400, { error: "bad_request", reason: "body is not JSON" }); }
      if (!json || typeof json !== "object" || Array.isArray(json) || typeof json.text !== "string") {
        return sendParse(res, 400, { error: "bad_request", reason: 'body must be {"text": string}' });
      }
      if (json.text.trim() === "") return sendParse(res, 400, { error: "bad_request", reason: "text is empty" });
      if ([...json.text].length > MAX_TEXT_CHARS) {
        return sendParse(res, 413, { error: "text_too_long", reason: `text is longer than ${MAX_TEXT_CHARS} characters` });
      }

      const result = await parse(json.text);
      return sendParse(res, result.status, result.body, result.retryAfterSec ? { "Retry-After": String(result.retryAfterSec) } : {});
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
  const sdkMaxRetries = readSdkMaxRetries();
  const client = keyConfigured
    ? createModelClient({ apiKey, maxRetries: sdkMaxRetries })
    : null;

  const build = readBuildInfo();
  const server = createApp({ client, keyConfigured, systemPrompt, build });
  server.listen(port, "0.0.0.0", () => {
    console.log(`Salo LLM proxy on port ${port} (model ${MODEL}).`);
    console.log(`Build: git commit ${build.gitCommit ?? "unknown"}, ${build.gitDirty === null ? "dirty state unknown" : build.gitDirty ? "server/ has uncommitted changes" : "server/ clean"}.`);
    console.log(`SDK retries per /parse call: ${sdkMaxRetries} (SALO_SDK_MAX_RETRIES; evaluation runs use 0).`);
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
