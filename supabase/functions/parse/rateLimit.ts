// Per-device and global sliding-window limits over parse_requests, checked before any model call.
// Best effort: the count and the insert are separate statements, so a burst of simultaneous requests can exceed the
// limit by the number in flight. A database function with an advisory lock would make it exact (not built; see README).
import { GLOBAL_PER_MINUTE, PER_DEVICE_PER_MINUTE, RATE_WINDOW_MS } from "./config.ts";
import type { RequestStore } from "./requestStore.ts";

export type RateDecision =
  | { allowed: true }
  | { allowed: false; scope: "device" | "global"; retryAfterSec: number };

// The oldest rows are fetched (ascending), capped at limit+1. If the count reaches the limit, the slot frees when the row
// at index count-limit leaves the window, so Retry-After is computed from that row's created_at.
function decide(rows: string[], limit: number, nowMs: number): number | null {
  if (rows.length < limit) return null;
  const freeing = Date.parse(rows[rows.length - limit]) + RATE_WINDOW_MS;
  return Math.max(1, Math.ceil((freeing - nowMs) / 1000));
}

export async function checkRateLimit(store: RequestStore, deviceId: string, nowMs: number): Promise<RateDecision> {
  const sinceIso = new Date(nowMs - RATE_WINDOW_MS).toISOString();
  const cap = GLOBAL_PER_MINUTE + 1;

  const device = await store.recentCounted(sinceIso, deviceId, cap);
  const devRetry = decide(device, PER_DEVICE_PER_MINUTE, nowMs);
  if (devRetry !== null) return { allowed: false, scope: "device", retryAfterSec: devRetry };

  const global = await store.recentCounted(sinceIso, null, cap);
  const globalRetry = decide(global, GLOBAL_PER_MINUTE, nowMs);
  if (globalRetry !== null) return { allowed: false, scope: "global", retryAfterSec: globalRetry };

  return { allowed: true };
}
