// Claude-path recorder for the parser tuning set (M4). Sends the 170 tuning messages to the laptop proxy's POST /parse,
// one pass at a time, and appends EVERY attempt to docs/reports/claude-tuning/pass-<n>.jsonl. Scores are computed later
// from those files only (src/parse/eval). Tuning evenings E01..E10 only (server/src/tuning.js asserts it on load).
//
// Pacing (decision "Recorder pacing", docs/decisions.md, 2026-10-20): at most RATE_LIMIT_PER_MINUTE sends in any sliding
// 60 s window (the proxy's own limit) and at least 2100 ms between sends. Every send is paced, retries included.
//
// Retries (coordinator spec change, 2026-10-20), at most MAX_ATTEMPTS attempts per message and pass:
//   - HTTP 429 (the proxy's own limit or Claude's): wait Retry-After seconds (60 when the header is missing), then resend.
//   - HTTP 503 with body.error "model_unavailable", and network errors (fetch throws, refused connection, timeout):
//     wait 2 s, 4 s, 8 s, 16 s between attempts, then resend.
//   - Never retried: 503 "model_output_rejected", 422 and any other status. Those are real parse outcomes, recorded once.
// Waiting never resets pacing.
//
// Safety stops (the pass stops at once; the JSONL keeps every attempt written so far):
//   - any attempt with body.error_kind "auth" or "bad_request" (setup faults, not outages);
//   - 5 consecutive messages that end with no usable response (every attempt was a 429, an outage or a network error);
//   - a crash that is caught, or SIGINT (Ctrl+C).
//
// Each pass file ends with one marker line: {"type":"pass_end","pass","status":"completed"|"stopped","reason","messages_sent",
// "ended_at"}. "completed" means all 170 messages were sent. A file without a marker was killed; the scorer treats it as
// not completed.
//
// Run with the proxy started as SALO_SDK_MAX_RETRIES=0 (so no attempt is hidden inside the SDK):
//   node eval/record-tuning.js --pass 1 [--base-url http://127.0.0.1:8787] [--out-dir <dir>] [--dry-run]
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod/v4";
import { MODEL, MAX_OUTPUT_TOKENS, RATE_LIMIT_PER_MINUTE } from "../src/config.js";
import { loadTuningRows } from "../src/tuning.js";
import { buildSystemPrompt } from "../src/prompt.js";
import { ModelOutput } from "../src/schema.js";

export const MIN_SPACING_MS = 2100;
export const WINDOW_MS = 60_000;
export const MAX_ATTEMPTS = 5;
export const DEFAULT_RETRY_AFTER_S = 60;
export const BACKOFF_MS = [2000, 4000, 8000, 16000];
export const REQUEST_TIMEOUT_MS = 30_000;
export const SAFETY_STOP_CONSECUTIVE = 5;
export const FATAL_ERROR_KINDS = ["auth", "bad_request"];
export const PASSES = [1, 2, 3];
export const DEFAULT_BASE_URL = "http://127.0.0.1:8787";
export const DEFAULT_OUT_DIR = resolve(fileURLToPath(new URL("../../docs/reports/claude-tuning", import.meta.url)));
// Prices live in server/eval/pricing.json, the one place they are kept (the scorer reads the same file).
export const PRICING = JSON.parse(readFileSync(new URL("./pricing.json", import.meta.url), "utf8"));
export const PRICE_INPUT_PER_MTOK = PRICING.input_per_mtok;
export const PRICE_OUTPUT_PER_MTOK = PRICING.output_per_mtok;
// Rough token estimate (about 4 characters per token). This is not a tokenizer; the dry run says so.
export const CHARS_PER_TOKEN = 4;

// reason is the short machine-readable reason written to the pass_end marker (for example "auth").
export class RecorderError extends Error {
  constructor(message, reason = message) {
    super(message);
    this.reason = reason;
  }
}

export function parseArgs(argv) {
  const opts = { baseUrl: DEFAULT_BASE_URL, pass: null, outDir: DEFAULT_OUT_DIR, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const eq = arg.startsWith("--") ? arg.indexOf("=") : -1;
    const name = eq > 0 ? arg.slice(0, eq) : arg;
    const inline = eq > 0 ? arg.slice(eq + 1) : undefined;
    const value = () => {
      if (inline !== undefined) return inline;
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new RecorderError(`${name} needs a value`);
      return v;
    };
    if (name === "--base-url") opts.baseUrl = value();
    else if (name === "--pass") opts.pass = value();
    else if (name === "--out-dir") opts.outDir = resolve(value());
    else if (name === "--dry-run" && inline === undefined) opts.dryRun = true;
    else throw new RecorderError(`unknown argument: ${arg}`);
  }
  if (opts.pass === null) throw new RecorderError("--pass <n> is required (1, 2 or 3)");
  if (!/^[1-3]$/.test(opts.pass)) throw new RecorderError(`--pass must be 1, 2 or 3 (got "${opts.pass}")`);
  opts.pass = Number(opts.pass);
  opts.baseUrl = opts.baseUrl.replace(/\/+$/, "");
  return opts;
}

// Retry-After as whole seconds, or null when the header is absent or not a whole number.
export function parseRetryAfter(value) {
  if (value === null || value === undefined) return null;
  const v = String(value).trim();
  return /^\d+$/.test(v) ? Number(v) : null;
}

// An outage attempt: a network error (status null) or a 503 model_unavailable. Mirrored in src/parse/eval/claudeTuning.ts.
export function isOutage(status, error) {
  return status === null || (status === 503 && error === "model_unavailable");
}

// Error class and code only, never the message text (which could carry a secret).
export function networkDetail(err) {
  const code = err?.cause?.code ?? err?.code;
  return [err?.name ?? "Error", code].filter(Boolean).join("/");
}

// Spacing and window pacer. Every send counts, including sends that get a 429 or an outage (the proxy counts them too).
// Matches the proxy's sliding window in src/rateLimit.js: a send at t counts earlier sends s with t - s < windowMs.
export function createPacer({ now, sleep, limit = RATE_LIMIT_PER_MINUTE, windowMs = WINDOW_MS, minSpacingMs = MIN_SPACING_MS }) {
  const sends = [];
  const earliest = () => {
    let t = now();
    if (sends.length) t = Math.max(t, sends[sends.length - 1] + minSpacingMs);
    const inWindow = sends.filter((s) => t - s < windowMs);
    if (inWindow.length >= limit) t = Math.max(t, inWindow[inWindow.length - limit] + windowMs);
    return t;
  };
  return {
    // Resolves with the send time once both rules allow a send.
    async waitForSlot() {
      let t = earliest();
      while (t > now()) {
        await sleep(t - now(), "pacing");
        t = earliest();
      }
      const at = now();
      sends.push(at);
      return at;
    },
  };
}

const iso = (ms) => new Date(ms).toISOString();

// The gold answer for a tuning row, in the shape of the model's output. Used only to estimate output tokens.
export function goldOutput(row) {
  const items = row.gold_food_item
    ? [{ food_item: row.gold_food_item, quantity: row.gold_quantity, unit: row.gold_unit || null }]
    : [];
  return { is_food_message: items.length > 0, items, pickup_by: row.gold_pickup_by, missing: [] };
}

// Estimate for one pass (one request per message). Tokens are characters / CHARS_PER_TOKEN.
export function estimateCost(rows, systemPrompt) {
  const schemaChars = JSON.stringify(z.toJSONSchema(ModelOutput)).length;
  const fixedTokens = (systemPrompt.length + schemaChars) / CHARS_PER_TOKEN;
  const messageTokens = rows.reduce((s, r) => s + r.message_text.length, 0) / CHARS_PER_TOKEN;
  const inputTokens = rows.length * fixedTokens + messageTokens;
  const expectedOutputTokens = rows.reduce((s, r) => s + JSON.stringify(goldOutput(r)).length, 0) / CHARS_PER_TOKEN;
  const worstOutputTokens = rows.length * MAX_OUTPUT_TOKENS;
  const usd = (inTok, outTok) => (inTok * PRICE_INPUT_PER_MTOK + outTok * PRICE_OUTPUT_PER_MTOK) / 1e6;
  const n = rows.length;
  const inCall = inputTokens / n;
  const outCall = expectedOutputTokens / n;
  return {
    systemChars: systemPrompt.length,
    schemaChars,
    calls: n,
    inputTokens,
    expectedOutputTokens,
    worstOutputTokens,
    expectedUsd: usd(inputTokens, expectedOutputTokens),
    worstUsd: usd(inputTokens, worstOutputTokens),
    perCall: {
      inputTokens: inCall,
      outputTokens: outCall,
      inputUsd: (inCall * PRICE_INPUT_PER_MTOK) / 1e6,
      outputUsd: (outCall * PRICE_OUTPUT_PER_MTOK) / 1e6,
      expectedUsd: usd(inCall, outCall),
      worstUsd: usd(inCall, MAX_OUTPUT_TOKENS),
    },
  };
}

export function planLines({ rows, opts, systemPrompt, fileExists }) {
  const est = estimateCost(rows, systemPrompt);
  const file = join(opts.outDir, `pass-${opts.pass}.jsonl`);
  const minSec = ((rows.length - 1) * MIN_SPACING_MS) / 1000;
  const usd = (x) => `$${x.toFixed(4)}`;
  const pc = est.perCall;
  const n = rows.length;
  return [
    "Claude-path recorder: plan (dry run, nothing sent)",
    `  proxy: ${opts.baseUrl} (a dry run does not call GET /health or POST /parse)`,
    `  model: ${MODEL} (the run confirms the model from /health)`,
    `  pass: ${opts.pass} of ${PASSES.length}`,
    `  messages: ${n} tuning messages (E01..E10), file order`,
    `  requests: ${n} if nothing is retried; at most ${n * MAX_ATTEMPTS} with retries`,
    `  pacing: at least ${MIN_SPACING_MS} ms between sends; at most ${RATE_LIMIT_PER_MINUTE} sends per ${WINDOW_MS / 1000} s sliding window`,
    `  retries: 429 waits Retry-After (60 s if absent); 503 model_unavailable and network errors wait 2, 4, 8, 16 s; ` +
      `503 model_output_rejected and 422 are never retried; at most ${MAX_ATTEMPTS} attempts per message`,
    `  safety stops: any error_kind auth or bad_request; ${SAFETY_STOP_CONSECUTIVE} consecutive messages with no usable response; ` +
      "a caught crash or Ctrl+C (each writes a stopped pass_end marker)",
    `  minimum duration: ${n - 1} gaps x ${MIN_SPACING_MS / 1000} s = ${minSec.toFixed(1)} s (about ${(minSec / 60).toFixed(1)} min), plus model time and any waits`,
    `  output: ${file}${fileExists ? "  (EXISTS: a real run would refuse)" : "  (new file)"}`,
    "  Cost estimate (not a bill). Estimate leaves out thinking tokens (Haiku 5.5 runs adaptive thinking; they are billed as output). Real spend is measured from the logged usage.",
    `    system prompt: ${est.systemChars} characters; output schema: ${est.schemaChars} characters; tokens = characters / ${CHARS_PER_TOKEN}`,
    `    per call: input about ${Math.round(pc.inputTokens)} tokens = ${usd(pc.inputUsd)}; output about ${Math.round(pc.outputTokens)} tokens (from the gold answers) = ${usd(pc.outputUsd)}; total ${usd(pc.expectedUsd)} (worst case ${usd(pc.worstUsd)}, 2048 output tokens)`,
    `    per pass (${n} calls): ${usd(est.expectedUsd)} expected; worst case ${usd(est.worstUsd)}`,
    `    3 passes (${3 * n} calls): ${usd(3 * est.expectedUsd)} expected; worst case ${usd(3 * est.worstUsd)}`,
    `  Prices (${PRICING.source}, ${PRICING.date}): $${PRICING.input_per_mtok} per million input tokens, $${PRICING.output_per_mtok} per million output tokens.`,
  ];
}

async function getHealth(baseUrl, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(`${baseUrl}/health`, { method: "GET" });
  } catch (err) {
    throw new RecorderError(`cannot reach the proxy at ${baseUrl} (${err.name}). Is it running?`, "proxy_unreachable");
  }
  if (res.status !== 200) throw new RecorderError(`GET /health returned HTTP ${res.status}`, "health_failed");
  let json;
  try {
    json = await res.json();
  } catch {
    throw new RecorderError("GET /health did not return JSON", "health_failed");
  }
  if (json?.ok !== true || typeof json.model !== "string") throw new RecorderError("GET /health: unexpected body", "health_failed");
  if (json.key !== true) {
    throw new RecorderError("the proxy has no API key (GET /health says key: false). Refusing to run.", "no_key");
  }
  if (typeof json.prompt_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(json.prompt_sha256)) {
    throw new RecorderError("GET /health has no prompt_sha256: the proxy is older than this recorder. Update server/ and restart it.", "health_failed");
  }
  if (typeof json.request_config_sha256 !== "string" || !/^[0-9a-f]{64}$/.test(json.request_config_sha256)) {
    throw new RecorderError("GET /health has no request_config_sha256: the proxy is older than this recorder. Update server/ and restart it.", "health_failed");
  }
  const sha = (v) => (typeof v === "string" && /^[0-9a-f]{40}$/.test(v) ? v : null);
  return {
    model: json.model,
    prompt_sha256: json.prompt_sha256,
    request_config_sha256: json.request_config_sha256,
    git_commit: sha(json.git_commit),
    git_dirty: typeof json.git_dirty === "boolean" ? json.git_dirty : null,
  };
}

// Every attempt line and the pass_end marker carry the proxy identity read at the start of the pass.
export const HEALTH_RECHECK_EVERY = 25;

// Runs one pass. Deps are injectable for tests: fetchImpl, now (ms), sleep(ms, reason), log, rows, handleSigint.
export async function run(opts, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((m) => console.log(m));
  const rows = deps.rows ?? loadTuningRows();
  const file = join(opts.outDir, `pass-${opts.pass}.jsonl`);

  if (existsSync(file)) throw new RecorderError(`${file} already exists. Refusing to overwrite it; use a new pass number or move the file aside.`, "file_exists");
  const meta = await getHealth(opts.baseUrl, fetchImpl);
  log(`model (from /health): ${meta.model}; prompt_sha256 ${meta.prompt_sha256.slice(0, 12)}; git ${meta.git_commit ?? "unknown"}`);

  // Re-reads /health before message 26, 51, ... Any change of prompt or model stops the pass.
  const recheck = async () => {
    let again;
    try {
      again = await getHealth(opts.baseUrl, fetchImpl);
    } catch (err) {
      throw new RecorderError(`GET /health failed during the pass: ${err.message}`, err.reason ?? "health_unavailable");
    }
    if (again.prompt_sha256 !== meta.prompt_sha256) {
      throw new RecorderError(`prompt_sha256 changed during the pass (${meta.prompt_sha256.slice(0, 12)} -> ${again.prompt_sha256.slice(0, 12)}). ` +
        "The rest of the pass would not use the same prompt, so the pass stops here.", "prompt_changed");
    }
    if (again.request_config_sha256 !== meta.request_config_sha256) {
      throw new RecorderError(`request_config_sha256 changed during the pass (${meta.request_config_sha256.slice(0, 12)} -> ${again.request_config_sha256.slice(0, 12)}). The pass stops here.`, "request_config_changed");
    }
    if (again.model !== meta.model) {
      throw new RecorderError(`model changed during the pass (${meta.model} -> ${again.model}). The pass stops here.`, "model_changed");
    }
  };
  mkdirSync(opts.outDir, { recursive: true });
  try {
    closeSync(openSync(file, "wx"));
  } catch (err) {
    if (err.code === "EEXIST") throw new RecorderError(`${file} already exists. Refusing to overwrite it.`, "file_exists");
    throw err;
  }

  const pacer = createPacer({ now, sleep });
  const stats = { messages: rows.length, attempts: 0, http429: 0, retries: 0, outageAttempts: 0, networkErrors: 0, answered: 0, unanswered: [] };
  const writeLine = (line) => appendFileSync(file, `${JSON.stringify(line)}\n`);
  let messagesSent = 0;
  let endWritten = false;
  const writeEnd = (status, reason) => {
    if (endWritten) return;
    endWritten = true;
    writeLine({
      type: "pass_end", pass: opts.pass, status, reason, messages_sent: messagesSent, ended_at: iso(now()),
      model: meta.model, prompt_sha256: meta.prompt_sha256, request_config_sha256: meta.request_config_sha256,
      git_commit: meta.git_commit, git_dirty: meta.git_dirty,
    });
  };
  const onSigint = () => {
    writeEnd("stopped", "interrupted");
    process.exit(130);
  };
  const handleSigint = deps.handleSigint ?? true;
  if (handleSigint) process.on("SIGINT", onSigint);

  let consecutiveUnanswered = [];
  try {
    for (let i = 0; i < rows.length; i++) {
      if (i > 0 && i % HEALTH_RECHECK_EVERY === 0) await recheck();
      const row = rows[i];
      let answered = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) stats.retries++;
        const sentMs = await pacer.waitForSlot();
        if (attempt === 1) messagesSent++;
        stats.attempts++;
        let rec;
        try {
          const res = await fetchImpl(`${opts.baseUrl}/parse`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text: row.message_text }),
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          const text = await res.text();
          let body = null;
          let bodyText = null;
          try {
            body = JSON.parse(text);
          } catch {
            bodyText = text;
          }
          const isObj = body !== null && typeof body === "object" && !Array.isArray(body);
          rec = {
            status: res.status,
            retryAfter: parseRetryAfter(res.headers.get("retry-after")),
            error: isObj && typeof body.error === "string" ? body.error : null,
            errorKind: isObj && typeof body.error_kind === "string" ? body.error_kind : null,
            errorDetail: null,
            body,
            bodyText,
            usage: isObj && body.usage && typeof body.usage === "object" ? body.usage : null,
            receivedMs: now(),
          };
        } catch (err) {
          rec = {
            status: null, retryAfter: null, error: "network_error", errorKind: null, errorDetail: networkDetail(err),
            body: null, bodyText: null, usage: null, receivedMs: now(),
          };
        }
        writeLine({
          type: "attempt",
          message_id: row.message_id, evening_id: row.evening_id, pass: opts.pass, attempt,
          http_status: rec.status, retry_after_s: rec.retryAfter, error: rec.error, error_kind: rec.errorKind,
          error_detail: rec.errorDetail, model: meta.model, prompt_sha256: meta.prompt_sha256,
          request_config_sha256: meta.request_config_sha256,
          git_commit: meta.git_commit, git_dirty: meta.git_dirty,
          sent_at: iso(sentMs), received_at: iso(rec.receivedMs), body: rec.body, body_text_if_not_json: rec.bodyText, usage: rec.usage,
        });
        const outage = isOutage(rec.status, rec.error);
        if (outage) stats.outageAttempts++;
        if (rec.status === null) stats.networkErrors++;
        if (rec.status === 429) stats.http429++;
        log(`pass ${opts.pass} ${i + 1}/${rows.length} ${row.message_id} attempt ${attempt}: ` +
          `${rec.status === null ? `network error (${rec.errorDetail})` : `HTTP ${rec.status}`}` +
          `${rec.error ? ` ${rec.error}` : ""}${rec.errorKind ? ` error_kind=${rec.errorKind}` : ""}` +
          `${rec.retryAfter !== null ? ` (Retry-After ${rec.retryAfter} s)` : ""}`);

        if (FATAL_ERROR_KINDS.includes(rec.errorKind)) {
          throw new RecorderError(`stopped at ${row.message_id}, attempt ${attempt}: error_kind "${rec.errorKind}" is a setup fault ` +
            "(key, model id or request), not an outage, so retrying would not help. Fix it, then start a new pass number. " +
            "The pass file keeps every attempt written so far.", rec.errorKind);
        }
        if (rec.status !== 429 && !outage) {
          answered = true;
          break;
        }
        if (attempt === MAX_ATTEMPTS) break;
        if (rec.status === 429) await sleep((rec.retryAfter ?? DEFAULT_RETRY_AFTER_S) * 1000, "retry_after");
        else await sleep(BACKOFF_MS[attempt - 1], "backoff");
      }
      if (answered) {
        stats.answered++;
        consecutiveUnanswered = [];
      } else {
        stats.unanswered.push(row.message_id);
        consecutiveUnanswered.push(row.message_id);
        if (consecutiveUnanswered.length >= SAFETY_STOP_CONSECUTIVE) {
          throw new RecorderError(`stopped: ${SAFETY_STOP_CONSECUTIVE} consecutive messages (${consecutiveUnanswered.join(", ")}) ended with no usable ` +
            "response (429, outage or network error on every attempt). This looks like a proxy or Claude outage. Check the proxy " +
            "and its error_kind values before starting a new pass. The pass file keeps every attempt written so far.",
          "no_usable_response_x5");
        }
      }
    }
  } catch (err) {
    if (err instanceof RecorderError) writeEnd("stopped", err.reason);
    else writeEnd("stopped", `crash: ${err?.name ?? "Error"}`);
    throw err;
  } finally {
    if (handleSigint) process.off("SIGINT", onSigint);
  }
  writeEnd(messagesSent === rows.length ? "completed" : "stopped", messagesSent === rows.length ? null : "incomplete");

  log(`pass ${opts.pass} completed: ${stats.messages} messages sent, ${stats.answered} answered, ${stats.unanswered.length} unanswered, ` +
    `${stats.attempts} attempts, ${stats.outageAttempts} outage attempts (${stats.networkErrors} network), ${stats.http429} got 429, ` +
    `${stats.retries} retries. File: ${file}`);
  return { ...stats, file };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const opts = parseArgs(argv);
  const rows = deps.rows ?? loadTuningRows();
  if (opts.dryRun) {
    const systemPrompt = buildSystemPrompt(rows);
    const fileExists = existsSync(join(opts.outDir, `pass-${opts.pass}.jsonl`));
    for (const line of planLines({ rows, opts, systemPrompt, fileExists })) (deps.log ?? console.log)(line);
    return null;
  }
  return run(opts, { ...deps, rows });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`record-tuning: ${err.message}`);
    process.exit(1);
  });
}
