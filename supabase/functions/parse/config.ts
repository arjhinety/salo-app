// Constants for the parse function. They mirror server/src/config.js, plus the database-backed rate limits.
export const MODEL = "claude-haiku-5-5";
export const SDK_VERSION = "0.135.0"; // must equal the @anthropic-ai/sdk pin in server/package.json and deno.json
export const SDK_TIMEOUT_MS = 8000;
export const DEFAULT_SDK_MAX_RETRIES = 1;
export const MAX_OUTPUT_TOKENS = 2048;
export const MAX_TEXT_CHARS = 500;
export const MAX_BODY_BYTES = 8 * 1024;
export const REQUEST_EFFORT = "low";

// Rate limits, counted over parse_requests rows in a sliding window. See README.md for which rows count.
export const RATE_WINDOW_MS = 60_000;
export const PER_DEVICE_PER_MINUTE = 10;
export const GLOBAL_PER_MINUTE = 30;

// SALO_SDK_MAX_RETRIES: integer 0 or more; unset means the default. Anything else throws (the function refuses to start).
export function readSdkMaxRetries(env: (name: string) => string | undefined): number {
  const raw = env("SALO_SDK_MAX_RETRIES");
  if (raw === undefined) return DEFAULT_SDK_MAX_RETRIES;
  if (!/^\d+$/.test(raw)) throw new Error(`SALO_SDK_MAX_RETRIES must be an integer 0 or more (got "${raw}")`);
  return Number(raw);
}
