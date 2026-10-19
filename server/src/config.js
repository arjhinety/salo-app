// Loads server/.env (if present) into process.env without overriding real environment variables.
// Never logs or returns the key; callers only learn whether one is set.
import { existsSync, readFileSync } from "node:fs";

export const ENV_FILE_URL = new URL("../.env", import.meta.url);
export const MODEL = "claude-haiku-5-5";
export const SDK_TIMEOUT_MS = 8000;
export const SDK_MAX_RETRIES = 1;
export const MAX_TEXT_CHARS = 500;
export const MAX_BODY_BYTES = 8 * 1024;
export const RATE_LIMIT_PER_MINUTE = 30;

export function loadEnvFile(url = ENV_FILE_URL, env = process.env) {
  if (!existsSync(url)) return;
  const lines = readFileSync(url, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const name = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (env[name] === undefined) env[name] = value;
  }
}

export function readPort(env = process.env) {
  const raw = env.PORT ?? "8787";
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer from 1 to 65535 (got "${raw}")`);
  }
  return port;
}
