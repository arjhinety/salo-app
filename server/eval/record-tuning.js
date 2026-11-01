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
//
// Edge target (--target edge, added 2026-11-01): the same recorder scores the DEPLOYED Supabase Edge Function parse
// (POST <EXPO_PUBLIC_SUPABASE_URL>/functions/v1/parse, GET .../parse/health), not the laptop proxy. Only edge mode differs:
//   - the URL and publishable key come from the git-ignored root .env, read in code and never printed. --base-url is refused.
//   - the recorder signs in anonymously (@supabase/supabase-js, resolved from the repo root), prints the auth user id, and
//     (real run only) registers ONE devices row the way src/backend/supabase.ts does (role dashboard, profile null).
//     Every request sends apikey and Authorization: Bearer <access token>. The session is refreshed 120 s before it
//     expires. A 401 refreshes once and resends; a 401 on that resend stops the pass with reason auth.
//   - pacing: at most 10 sends per sliding 60 s window and at least 6100 ms between sends (the function's per-device
//     limit is 10 per minute). Retries follow the rules above; the function's own 429 waits Retry-After like any 429.
//   - /health has no git_commit. Each line and marker records the LOCAL repo commit and dirty state at the start of the
//     pass (the dirty check leaves out the edge output folder). They do not identify the deployed code: the identity is
//     request_config_sha256.
//   - 400 bad_request and 403 device_not_registered are setup faults: the pass stops at once with that reason.
//   - cost guard (reason cost_cap): the logged usage (server/eval/pricing.json) of every .jsonl in the edge folder is
//     summed. An outage attempt with no usage is counted at its worst case (2048 output tokens), since it may have been
//     billed. A send is refused when the total plus that call's worst case would exceed $0.60.
//   - every attempt line and the pass_end marker carry "target": "edge". Laptop lines have no target key (missing = laptop).
//   - output: docs/reports/claude-tuning-edge/pass-<n>.jsonl. docs/reports/claude-tuning/ is never touched.
//   - --probe (edge only) sends ONE message (the first tuning message) to docs/reports/claude-tuning-edge/probe.jsonl.
//     The scorer does not read it (it is not a pass file), but the cost guard counts it.
//   - --dry-run in edge mode signs in (the /health call needs the auth header), calls GET /health only, and prints the
//     plan. It sends no /parse and registers no device.
//   node eval/record-tuning.js --target edge --dry-run --pass 1
//   node eval/record-tuning.js --target edge --probe
//   node eval/record-tuning.js --target edge --pass <n>
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod/v4";
import { MODEL, MAX_OUTPUT_TOKENS, RATE_LIMIT_PER_MINUTE, loadEnvFile } from "../src/config.js";
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
// The plan: 3 completed passes per request config. Pass numbers are not limited to this; a stopped pass gets a new number.
export const PLANNED_PASSES = 3;
export const DEFAULT_BASE_URL = "http://127.0.0.1:8787";
export const DEFAULT_OUT_DIR = resolve(fileURLToPath(new URL("../../docs/reports/claude-tuning", import.meta.url)));
// Prices live in server/eval/pricing.json, the one place they are kept (the scorer reads the same file).
export const PRICING = JSON.parse(readFileSync(new URL("./pricing.json", import.meta.url), "utf8"));
export const PRICE_INPUT_PER_MTOK = PRICING.input_per_mtok;
export const PRICE_OUTPUT_PER_MTOK = PRICING.output_per_mtok;
// Rough token estimate (about 4 characters per token). This is not a tokenizer; the dry run says so.
export const CHARS_PER_TOKEN = 4;

// Edge target (see the header). The function's own limit is 10 per device per minute, so the recorder stays under it.
export const TARGETS = ["laptop", "edge"];
export const EDGE_MIN_SPACING_MS = 6100;
export const EDGE_RATE_LIMIT_PER_MINUTE = 10;
export const EDGE_COST_CAP_USD = 0.6;
export const EDGE_REFRESH_MARGIN_MS = 120_000;
export const EDGE_FUNCTION_PATH = "/functions/v1/parse";
export const EDGE_DEVICE = { role: "dashboard", profileId: null };
export const EDGE_FATAL_ERRORS = ["bad_request", "device_not_registered"];
export const DEFAULT_EDGE_OUT_DIR = resolve(fileURLToPath(new URL("../../docs/reports/claude-tuning-edge", import.meta.url)));
export const PROBE_FILE = "probe.jsonl";
export const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
export const ROOT_ENV_URL = new URL("../../.env", import.meta.url);

// reason is the short machine-readable reason written to the pass_end marker (for example "auth").
export class RecorderError extends Error {
  constructor(message, reason = message) {
    super(message);
    this.reason = reason;
  }
}

export function parseArgs(argv) {
  const opts = { baseUrl: DEFAULT_BASE_URL, pass: null, outDir: DEFAULT_OUT_DIR, dryRun: false, target: "laptop", probe: false };
  let baseUrlGiven = false;
  let outDirGiven = false;
  let passGiven = false;
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
    if (name === "--base-url") {
      opts.baseUrl = value();
      baseUrlGiven = true;
    } else if (name === "--pass") {
      opts.pass = value();
      passGiven = true;
    } else if (name === "--out-dir") {
      opts.outDir = resolve(value());
      outDirGiven = true;
    } else if (name === "--target") {
      opts.target = value();
      if (!TARGETS.includes(opts.target)) throw new RecorderError(`--target must be laptop or edge (got "${opts.target}")`);
    } else if (name === "--dry-run" && inline === undefined) opts.dryRun = true;
    else if (name === "--probe" && inline === undefined) opts.probe = true;
    else throw new RecorderError(`unknown argument: ${arg}`);
  }
  if (opts.target === "edge") {
    if (baseUrlGiven) throw new RecorderError("--base-url is for the laptop proxy; the edge target reads its URL from the root .env");
    if (!outDirGiven) opts.outDir = DEFAULT_EDGE_OUT_DIR;
  }
  if (opts.probe) {
    if (opts.target !== "edge") throw new RecorderError("--probe needs --target edge");
    if (passGiven) throw new RecorderError("--probe sends one message and takes no --pass");
    return opts;
  }
  if (opts.pass === null) throw new RecorderError(`--pass <n> is required (a whole number from 1; the plan is ${PLANNED_PASSES} completed passes per request config)`);
  if (!/^[1-9]\d*$/.test(opts.pass)) throw new RecorderError(`--pass must be a whole number from 1 (got "${opts.pass}")`);
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
    `  pass: ${opts.pass} (any whole number from 1; the plan is ${PLANNED_PASSES} completed passes per request config)`,
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
    `    ${PLANNED_PASSES} passes (${PLANNED_PASSES * n} calls): ${usd(PLANNED_PASSES * est.expectedUsd)} expected; worst case ${usd(PLANNED_PASSES * est.worstUsd)}`,
    `  Prices (${PRICING.source}, ${PRICING.date}): $${PRICING.input_per_mtok} per million input tokens, $${PRICING.output_per_mtok} per million output tokens.`,
  ];
}

// Error class and message kind only, never the text of a Supabase error (which could echo a token).
const describeError = (e) => (e ? [e.name, e.status ? `HTTP ${e.status}` : null, e.code].filter(Boolean).join(" ") || "error" : "no detail");

// Edge config from the root .env (EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, the app's own names).
// Errors name the variable, never its value.
export function edgeConfig(env) {
  const url = (env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
  if (url === "") throw new RecorderError("EXPO_PUBLIC_SUPABASE_URL is not set in the root .env (edge target)", "config");
  if (key === "") throw new RecorderError("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set in the root .env (edge target)", "config");
  if (!/^https:\/\//.test(url)) throw new RecorderError("EXPO_PUBLIC_SUPABASE_URL must start with https:// (edge target)", "config");
  return { url, key, functionUrl: `${url}${EDGE_FUNCTION_PATH}` };
}

export function rootEnv() {
  const env = {};
  loadEnvFile(ROOT_ENV_URL, env);
  return env;
}

// @supabase/supabase-js lives in the repo root node_modules, not in server/. Loaded only in edge mode.
export function loadCreateClient() {
  return createRequire(new URL("../../package.json", import.meta.url))("@supabase/supabase-js").createClient;
}

// Signs in anonymously and returns the session holder: headers(), ensureFresh(), refresh(), registerDevice(). Nothing
// here logs a token or the key. Prints the auth user id, for cleanup later.
export async function openEdgeAuth({ url, key }, { createClient, now, log }) {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  let signed;
  try {
    signed = await client.auth.signInAnonymously();
  } catch (err) {
    signed = { error: err, data: null };
  }
  if (signed.error || !signed.data?.session) {
    throw new RecorderError(`anonymous sign-in failed (${describeError(signed.error)}). Check that anonymous sign-in is enabled for the project.`, "auth");
  }
  let session = signed.data.session;
  const auth = {
    userId: session.user.id,
    headers() {
      return { apikey: key, Authorization: `Bearer ${session.access_token}` };
    },
    async refresh() {
      let out;
      try {
        out = await client.auth.refreshSession({ refresh_token: session.refresh_token });
      } catch (err) {
        out = { error: err, data: null };
      }
      if (out.error || !out.data?.session) throw new RecorderError(`token refresh failed (${describeError(out.error)}); the pass stops`, "auth");
      session = out.data.session;
    },
    async ensureFresh() {
      const exp = session.expires_at;
      if (typeof exp === "number" && exp * 1000 - now() < EDGE_REFRESH_MARGIN_MS) await auth.refresh();
    },
    // The same upsert as src/backend/supabase.ts registerDevice (idempotent, ignoreDuplicates).
    async registerDevice(role, profileId) {
      let res;
      try {
        res = await client.from("devices").upsert({ id: session.user.id, role, profile_id: profileId }, { onConflict: "id", ignoreDuplicates: true });
      } catch (err) {
        res = { error: err };
      }
      if (res.error) throw new RecorderError(`device registration failed (${describeError(res.error)})`, "device_registration_failed");
    },
  };
  log(`auth user id (for cleanup): ${auth.userId}`);
  return auth;
}

// Local repo state for the edge lines (the function has no git_commit). Never throws: unknown is null.
export function readGitState({ repoRoot = REPO_ROOT, exclude = null } = {}) {
  const git = (args) => execFileSync("git", ["-C", repoRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15_000 });
  try {
    const commit = git(["rev-parse", "HEAD"]).trim();
    const pathspec = exclude ? ["--", ".", `:(exclude)${exclude}`] : [];
    const status = git(["status", "--porcelain", ...pathspec]).trim();
    return { commit: /^[0-9a-f]{40}$/.test(commit) ? commit : null, dirty: status !== "" };
  } catch {
    return { commit: null, dirty: null };
  }
}

// usage counts to USD. Same formula as costUsd in src/parse/eval/claudeTuning.ts (pricing.json is the one source).
export function usageCostUsd(u, pricing = PRICING) {
  const n = (v) => (typeof v === "number" ? v : 0);
  const inRate = pricing.input_per_mtok;
  return (n(u.input_tokens) * inRate + n(u.cache_creation_input_tokens) * inRate * pricing.cache_write_5m_multiplier
    + n(u.cache_read_input_tokens) * inRate * pricing.cache_read_multiplier + n(u.output_tokens) * pricing.output_per_mtok) / 1e6;
}

// The cost guard's ledger. logged: usage cost of every attempt that has usage. unknown: outage attempts with no usage,
// counted at their worst case (they may have been billed). A 429 or any non-outage attempt with no usage is not billed.
export function createSpendLedger(rows, systemPrompt, pricing = PRICING) {
  const schemaChars = JSON.stringify(z.toJSONSchema(ModelOutput)).length;
  const fixedTokens = (systemPrompt.length + schemaChars) / CHARS_PER_TOKEN;
  const worst = new Map(rows.map((r) => {
    const inTok = fixedTokens + r.message_text.length / CHARS_PER_TOKEN;
    return [r.message_id, (inTok * pricing.input_per_mtok + MAX_OUTPUT_TOKENS * pricing.output_per_mtok) / 1e6];
  }));
  const maxWorst = Math.max(0, ...worst.values());
  const worstFor = (id) => worst.get(id) ?? maxWorst;
  let logged = 0;
  let unknown = 0;
  let unknownCalls = 0;
  const files = [];
  const addAttempt = (a) => {
    if (a.usage && typeof a.usage === "object") logged += usageCostUsd(a.usage, pricing);
    else if (isOutage(a.http_status, a.error)) {
      unknown += worstFor(a.message_id);
      unknownCalls++;
    }
  };
  return {
    worstFor: (row) => worstFor(row.message_id),
    total: () => logged + unknown,
    addAttempt,
    addFile(name, text) {
      files.push(name);
      text.split("\n").forEach((line, i) => {
        if (line.trim() === "") return;
        let o;
        try {
          o = JSON.parse(line);
        } catch {
          throw new RecorderError(`${name} line ${i + 1} is not JSON; the cost guard cannot read it`, "cost_ledger");
        }
        if (o && o.type === "attempt") addAttempt(o);
      });
    },
    summary: () => ({ logged, unknown, unknownCalls, files: [...files] }),
  };
}

// Reads every .jsonl in the edge folder (any name: the guard counts everything there). A missing folder is empty.
export function loadSpendLedger(outDir, rows, systemPrompt = buildSystemPrompt(rows)) {
  const ledger = createSpendLedger(rows, systemPrompt);
  if (!existsSync(outDir)) return ledger;
  for (const name of readdirSync(outDir).filter((f) => f.endsWith(".jsonl")).sort()) {
    ledger.addFile(name, readFileSync(join(outDir, name), "utf8"));
  }
  return ledger;
}

// Error text names no secret. Only the laptop proxy's own errors use the "proxy" wording (unchanged).
async function getHealth(healthUrl, fetchImpl, { edge = false, headers = {}, shown = healthUrl } = {}) {
  let res;
  try {
    res = await fetchImpl(healthUrl, { method: "GET", headers });
  } catch (err) {
    throw new RecorderError(edge
      ? `cannot reach the Supabase Edge Function (${err.name}). Is the project paused or offline?`
      : `cannot reach the proxy at ${shown} (${err.name}). Is it running?`, "proxy_unreachable");
  }
  if (res.status === 401 && edge) throw new RecorderError("GET /health returned HTTP 401", "http_401");
  if (res.status !== 200) throw new RecorderError(`GET /health returned HTTP ${res.status}`, "health_failed");
  let json;
  try {
    json = await res.json();
  } catch {
    throw new RecorderError("GET /health did not return JSON", "health_failed");
  }
  if (json?.ok !== true || typeof json.model !== "string") throw new RecorderError("GET /health: unexpected body", "health_failed");
  if (json.key !== true) {
    throw new RecorderError(edge
      ? "the Edge Function has no ANTHROPIC_API_KEY secret (GET /health says key: false). Refusing to run."
      : "the proxy has no API key (GET /health says key: false). Refusing to run.", "no_key");
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

// Edge /health with the auth header. A 401 refreshes once and asks again; a 401 on that stops the pass (auth).
async function edgeHealth(auth, healthUrl, fetchImpl) {
  await auth.ensureFresh();
  try {
    return await getHealth(healthUrl, fetchImpl, { edge: true, headers: auth.headers() });
  } catch (err) {
    if (err.reason !== "http_401") throw err;
  }
  await auth.refresh();
  try {
    return await getHealth(healthUrl, fetchImpl, { edge: true, headers: auth.headers() });
  } catch (err) {
    if (err.reason === "http_401") throw new RecorderError("GET /health answered 401 again after a token refresh; the pass stops (auth)", "auth");
    throw err;
  }
}

// Every attempt line and the pass_end marker carry the proxy identity read at the start of the pass.
export const HEALTH_RECHECK_EVERY = 25;

// Runs one pass. Deps are injectable for tests: fetchImpl, now (ms), sleep(ms, reason), log, rows, handleSigint, and for the
// edge target createClient (the supabase-js factory) and gitState (() => { commit, dirty }).
export async function run(opts, deps = {}) {
  const edge = opts.target === "edge";
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const now = deps.now ?? (() => Date.now());
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((m) => console.log(m));
  const allRows = deps.rows ?? loadTuningRows();
  const rows = opts.probe ? allRows.slice(0, 1) : allRows;
  const file = join(opts.outDir, opts.probe ? PROBE_FILE : `pass-${opts.pass}.jsonl`);
  const passNo = opts.probe ? 0 : opts.pass;
  const label = opts.probe ? "probe" : `pass ${opts.pass}`;
  const healthUrl = `${opts.baseUrl}/health`;
  const parseUrl = edge ? opts.baseUrl : `${opts.baseUrl}/parse`;
  const tag = edge ? { target: "edge" } : {};

  if (existsSync(file)) {
    throw new RecorderError(`${file} already exists. Refusing to overwrite it; ${opts.probe ? "move it aside to send the probe again" : "use a new pass number or move the file aside"}.`, "file_exists");
  }

  let auth = null;
  let ledger = null;
  let meta;
  if (edge) {
    ledger = loadSpendLedger(opts.outDir, allRows);
    auth = deps.auth ?? (await openEdgeAuth(opts.supabase, { createClient: deps.createClient ?? loadCreateClient(), now, log }));
    const h = await edgeHealth(auth, healthUrl, fetchImpl);
    const gs = deps.gitState ? deps.gitState() : readGitState({ exclude: relative(REPO_ROOT, opts.outDir).split(sep).join("/") });
    meta = { ...h, git_commit: gs.commit, git_dirty: gs.dirty };
    log(`Edge Function model (from /health): ${meta.model}; prompt_sha256 ${meta.prompt_sha256.slice(0, 12)}; local git ${meta.git_commit ?? "unknown"}`);
    await auth.registerDevice(EDGE_DEVICE.role, EDGE_DEVICE.profileId);
  } else {
    meta = await getHealth(healthUrl, fetchImpl, { shown: opts.baseUrl });
    log(`model (from /health): ${meta.model}; prompt_sha256 ${meta.prompt_sha256.slice(0, 12)}; git ${meta.git_commit ?? "unknown"}`);
  }

  // Re-reads /health before message 26, 51, ... Any change of prompt or model stops the pass.
  const recheck = async () => {
    let again;
    try {
      again = edge ? await edgeHealth(auth, healthUrl, fetchImpl) : await getHealth(healthUrl, fetchImpl, { shown: opts.baseUrl });
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

  const pacer = edge
    ? createPacer({ now, sleep, limit: EDGE_RATE_LIMIT_PER_MINUTE, minSpacingMs: EDGE_MIN_SPACING_MS })
    : createPacer({ now, sleep });
  const stats = { messages: rows.length, attempts: 0, http429: 0, retries: 0, outageAttempts: 0, networkErrors: 0, answered: 0, unanswered: [] };
  const writeLine = (line) => appendFileSync(file, `${JSON.stringify(line)}\n`);
  let messagesSent = 0;
  let endWritten = false;
  const writeEnd = (status, reason) => {
    if (endWritten) return;
    endWritten = true;
    writeLine({
      type: "pass_end", pass: passNo, status, reason, messages_sent: messagesSent, ended_at: iso(now()),
      model: meta.model, prompt_sha256: meta.prompt_sha256, request_config_sha256: meta.request_config_sha256,
      git_commit: meta.git_commit, git_dirty: meta.git_dirty, ...tag,
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
      let authRetryPending = false;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) stats.retries++;
        if (edge) {
          await auth.ensureFresh();
          const projected = ledger.total() + ledger.worstFor(row);
          if (projected > EDGE_COST_CAP_USD) {
            throw new RecorderError(`stopped before ${row.message_id}, attempt ${attempt}: the logged spend plus this call's worst case ` +
              `would be $${projected.toFixed(4)}, above the $${EDGE_COST_CAP_USD.toFixed(2)} cap. Nothing more is sent. ` +
              "The pass file keeps every attempt written so far.", "cost_cap");
          }
        }
        const sentMs = await pacer.waitForSlot();
        if (attempt === 1) messagesSent++;
        stats.attempts++;
        let rec;
        try {
          const res = await fetchImpl(parseUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(edge ? auth.headers() : {}) },
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
          message_id: row.message_id, evening_id: row.evening_id, pass: passNo, attempt,
          http_status: rec.status, retry_after_s: rec.retryAfter, error: rec.error, error_kind: rec.errorKind,
          error_detail: rec.errorDetail, model: meta.model, prompt_sha256: meta.prompt_sha256,
          request_config_sha256: meta.request_config_sha256,
          git_commit: meta.git_commit, git_dirty: meta.git_dirty,
          sent_at: iso(sentMs), received_at: iso(rec.receivedMs), body: rec.body, body_text_if_not_json: rec.bodyText, usage: rec.usage,
          ...tag,
        });
        if (ledger) ledger.addAttempt({ message_id: row.message_id, usage: rec.usage, http_status: rec.status, error: rec.error });
        const outage = isOutage(rec.status, rec.error);
        if (outage) stats.outageAttempts++;
        if (rec.status === null) stats.networkErrors++;
        if (rec.status === 429) stats.http429++;
        log(`${label} ${i + 1}/${rows.length} ${row.message_id} attempt ${attempt}: ` +
          `${rec.status === null ? `network error (${rec.errorDetail})` : `HTTP ${rec.status}`}` +
          `${rec.error ? ` ${rec.error}` : ""}${rec.errorKind ? ` error_kind=${rec.errorKind}` : ""}` +
          `${rec.retryAfter !== null ? ` (Retry-After ${rec.retryAfter} s)` : ""}`);

        // Edge only: 401 means the token was rejected. Refresh once and resend; a 401 on that resend stops the pass.
        if (edge && rec.status === 401) {
          if (authRetryPending) {
            throw new RecorderError(`stopped at ${row.message_id}, attempt ${attempt}: 401 again after a token refresh. ` +
              "The pass stops (auth). The pass file keeps every attempt written so far.", "auth");
          }
          authRetryPending = true;
          await auth.refresh();
          continue;
        }
        authRetryPending = false;

        if (FATAL_ERROR_KINDS.includes(rec.errorKind)) {
          throw new RecorderError(`stopped at ${row.message_id}, attempt ${attempt}: error_kind "${rec.errorKind}" is a setup fault ` +
            "(key, model id or request), not an outage, so retrying would not help. Fix it, then start a new pass number. " +
            "The pass file keeps every attempt written so far.", rec.errorKind);
        }
        if (edge && (rec.status === 400 || rec.status === 403) && EDGE_FATAL_ERRORS.includes(rec.error)) {
          throw new RecorderError(`stopped at ${row.message_id}, attempt ${attempt}: "${rec.error}" is a setup fault (the request or the ` +
            "device registration), not an outage, so retrying would not help. Fix it, then start a new pass number. " +
            "The pass file keeps every attempt written so far.", rec.error);
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
  if (opts.probe) writeEnd("stopped", "probe");
  else writeEnd(messagesSent === rows.length ? "completed" : "stopped", messagesSent === rows.length ? null : "incomplete");

  log(`${label} completed: ${stats.messages} messages sent, ${stats.answered} answered, ${stats.unanswered.length} unanswered, ` +
    `${stats.attempts} attempts, ${stats.outageAttempts} outage attempts (${stats.networkErrors} network), ${stats.http429} got 429, ` +
    `${stats.retries} retries. File: ${file}`);
  return { ...stats, file };
}

// Plan for the edge target. Calls only GET /health (after the anonymous sign-in that its auth header needs).
export function edgePlanLines({ rows, opts, systemPrompt, health, git, spend, fileExists }) {
  const est = estimateCost(rows, systemPrompt);
  const file = join(opts.outDir, opts.probe ? PROBE_FILE : `pass-${opts.pass}.jsonl`);
  const n = rows.length;
  const minSec = ((n - 1) * EDGE_MIN_SPACING_MS) / 1000;
  const usd = (x) => `$${x.toFixed(4)}`;
  const pc = est.perCall;
  const short = (h) => `${h.slice(0, 12)}…`;
  return [
    "Claude-path recorder, Edge Function target: plan (dry run, nothing parsed)",
    "  target: the deployed Supabase Edge Function parse (URL and key from the root .env; the laptop proxy is not used)",
    `  health: GET /functions/v1/parse/health is the only request a dry run makes, after the anonymous sign-in its auth header needs. Model ${health.model}`,
    `  identity: prompt_sha256 ${short(health.prompt_sha256)}; request_config_sha256 ${short(health.request_config_sha256)} (the function's own hash)`,
    `  git: the function reports no git commit; recorded instead: local repo commit ${git.commit ?? "unknown"}, dirty ${git.dirty ?? "unknown"} ` +
      "(this does not identify the deployed code)",
    "  auth: one anonymous user; a real run registers one devices row (role dashboard, no profile) and prints the user id. A dry run registers nothing",
    opts.probe ? `  probe: ONE message (${rows[0].message_id}) to ${PROBE_FILE}; the scorer ignores it, the cost guard counts it` : `  pass: ${opts.pass}`,
    `  messages: ${n} tuning messages (E01..E10), file order`,
    `  requests: ${n} if nothing is retried; at most ${n * MAX_ATTEMPTS} with retries`,
    `  pacing: at least ${EDGE_MIN_SPACING_MS} ms between sends; at most ${EDGE_RATE_LIMIT_PER_MINUTE} sends per ${WINDOW_MS / 1000} s sliding window (the function's per-device limit)`,
    "  retries: 429 waits Retry-After (60 s if absent); 503 model_unavailable and network errors wait 2, 4, 8, 16 s; 503 model_output_rejected and 422 are never retried; " +
      `401 refreshes the session once and resends (a second 401 stops, reason auth); at most ${MAX_ATTEMPTS} attempts per message`,
    `  safety stops: auth, bad_request and device_not_registered (setup faults); ${SAFETY_STOP_CONSECUTIVE} consecutive messages with no usable response; ` +
      "cost_cap; a caught crash or Ctrl+C",
    `  cost guard: $${EDGE_COST_CAP_USD.toFixed(2)} cap over every .jsonl in ${opts.outDir} (${spend.files.length} file${spend.files.length === 1 ? "" : "s"} now). ` +
      `Logged spend so far ${usd(spend.logged)}; worst case for ${spend.unknownCalls} outage attempt${spend.unknownCalls === 1 ? "" : "s"} with no usage ${usd(spend.unknown)}. ` +
      "A send is refused when the total plus that call's worst case would pass the cap.",
    `  minimum duration: ${n - 1} gaps x ${EDGE_MIN_SPACING_MS / 1000} s = ${minSec.toFixed(1)} s (about ${(minSec / 60).toFixed(1)} min), plus model time and any waits`,
    `  output: ${file}${fileExists ? "  (EXISTS: a real run would refuse)" : "  (new file)"}`,
    "  SDK retries: the function's SALO_SDK_MAX_RETRIES (a Supabase secret; the code default is 1) is not reported by /health. " +
      "It must be 0, so that no attempt is hidden inside the SDK. Confirm it before a real run.",
    "  Cost estimate (not a bill). Estimate leaves out thinking tokens (Haiku 5.5 runs adaptive thinking; they are billed as output). Real spend is measured from the logged usage.",
    `    system prompt: ${est.systemChars} characters; output schema: ${est.schemaChars} characters; tokens = characters / ${CHARS_PER_TOKEN}`,
    `    per call: input about ${Math.round(pc.inputTokens)} tokens = ${usd(pc.inputUsd)}; output about ${Math.round(pc.outputTokens)} tokens (from the gold answers) = ${usd(pc.outputUsd)}; total ${usd(pc.expectedUsd)} (worst case ${usd(pc.worstUsd)}, 2048 output tokens)`,
    `    per pass (${n} calls): ${usd(est.expectedUsd)} expected; worst case ${usd(est.worstUsd)}`,
    `  Prices (${PRICING.source}, ${PRICING.date}): $${PRICING.input_per_mtok} per million input tokens, $${PRICING.output_per_mtok} per million output tokens.`,
  ];
}

export async function edgeDryRun(opts, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;
  const now = deps.now ?? (() => Date.now());
  const log = deps.log ?? ((m) => console.log(m));
  const allRows = deps.rows ?? loadTuningRows();
  const rows = opts.probe ? allRows.slice(0, 1) : allRows;
  const systemPrompt = buildSystemPrompt(allRows);
  const spend = loadSpendLedger(opts.outDir, allRows, systemPrompt).summary();
  const auth = await openEdgeAuth(opts.supabase, { createClient: deps.createClient ?? loadCreateClient(), now, log });
  const health = await edgeHealth(auth, `${opts.baseUrl}/health`, fetchImpl);
  const git = deps.gitState ? deps.gitState() : readGitState({ exclude: relative(REPO_ROOT, opts.outDir).split(sep).join("/") });
  const fileExists = existsSync(join(opts.outDir, opts.probe ? PROBE_FILE : `pass-${opts.pass}.jsonl`));
  for (const line of edgePlanLines({ rows, opts, systemPrompt, health, git, spend, fileExists })) log(line);
  return null;
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const opts = parseArgs(argv);
  const rows = deps.rows ?? loadTuningRows();
  if (opts.target === "edge") {
    const cfg = edgeConfig(deps.env ?? rootEnv());
    opts.baseUrl = cfg.functionUrl;
    opts.supabase = { url: cfg.url, key: cfg.key };
    if (opts.dryRun) return edgeDryRun(opts, { ...deps, rows });
    return run(opts, { ...deps, rows });
  }
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
