// Test doubles: an in-memory parse_requests store that follows the same rules as the Supabase adapter (counted statuses,
// NULL-safe local-limit exclusion, device filter, ascending order, limit), a scripted Anthropic messages client, and a
// controllable clock. No network.
import { COUNTED_STATUSES, LOCAL_RATE_LIMIT_KIND, type RequestRow, type RequestStore } from "../requestStore.ts";

export type StoredRow = RequestRow & { created_at: string };

export class FakeStore implements RequestStore {
  rows: StoredRow[] = [];
  failInsert = false;
  // Devices that have no devices row. Every other id is registered (the app registers devices at onboarding).
  unregistered = new Set<string>();
  constructor(private clock: () => number) {}

  deviceRegistered(deviceId: string): Promise<boolean> {
    return Promise.resolve(!this.unregistered.has(deviceId));
  }

  recentCounted(sinceIso: string, deviceId: string | null, limit: number): Promise<string[]> {
    const out = this.rows
      .filter((r) => (COUNTED_STATUSES as readonly number[]).includes(r.http_status))
      .filter((r) => r.error_kind === null || r.error_kind !== LOCAL_RATE_LIMIT_KIND)
      .filter((r) => r.created_at > sinceIso) // exclusive, as server/src/rateLimit.js drops stamps at exactly 60 s
      .filter((r) => deviceId === null || r.device_id === deviceId)
      .map((r) => r.created_at)
      .sort();
    return Promise.resolve(out.slice(0, limit));
  }

  insert(row: RequestRow): Promise<void> {
    if (this.failInsert) return Promise.reject(new Error("parse_requests insert failed: 42501"));
    // Mirrors the table: device_id must reference a devices row (foreign key 23503), text is NOT NULL and at most 500 chars.
    if (this.unregistered.has(row.device_id)) return Promise.reject(new Error("parse_requests insert failed: 23503"));
    if (typeof row.text !== "string" || [...row.text].length > 500) return Promise.reject(new Error("parse_requests insert failed: 23514"));
    this.rows.push({ ...row, created_at: new Date(this.clock()).toISOString() });
    return Promise.resolve();
  }
}

// Scripted Anthropic client: impl decides each response or throws. Records the arguments of every call.
// deno-lint-ignore no-explicit-any
export function fakeClient(impl: (args: any) => unknown | Promise<unknown>) {
  // deno-lint-ignore no-explicit-any
  const calls: any[] = [];
  return {
    calls,
    messages: {
      // deno-lint-ignore no-explicit-any
      parse: async (args: any) => {
        calls.push(args);
        return await impl(args);
      },
    },
  };
}

export function clock(start: number) {
  let t = start;
  return { now: () => t, set: (v: number) => (t = v), advance: (ms: number) => (t += ms) };
}

export const FAKE_KEY = "sk-ant-TEST-ONLY-not-a-real-key";
export const FAKE_USAGE = { input_tokens: 1000, output_tokens: 80, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 };
export const OK_OUT = {
  is_food_message: true,
  items: [
    { food_item: "adobo", quantity: 3, unit: "tray" },
    { food_item: "pandesal", quantity: 20, unit: "piece" },
  ],
  pickup_by: "20:00",
  missing: [],
};
export const modelOk = (out: unknown, stop_reason = "end_turn") => ({
  stop_reason,
  parsed_output: out,
  content: [],
  usage: FAKE_USAGE,
});
