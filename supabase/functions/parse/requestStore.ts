// The parse_requests table (created by the schema agent's migration) behind a small interface, so the handler and the
// rate limiter can run against an in-memory fake in tests. supabaseStore() is the production adapter: it uses the
// service-role client from the request context (ctx.supabaseAdmin), which bypasses row-level security.
//
// Columns used: device_id uuid, text, http_status, response jsonb, usage jsonb, error_kind, model,
// request_config_sha256, latency_ms, created_at (default now()).

// Rows that count toward the rate limits: every row that reached the model step or the no-key 503, plus model 429s.
// Our own local 429s (error_kind local_rate_limit) do not count, so a refused device cannot lock out the others.
export const COUNTED_STATUSES = [200, 422, 429, 503] as const;
export const LOCAL_RATE_LIMIT_KIND = "local_rate_limit";

export interface RequestRow {
  device_id: string; // NOT NULL with a foreign key to devices(id): unregistered users cannot be logged, so they get 403
  text: string; // NOT NULL: "" when the request had no accepted text (400 or 413)
  http_status: number;
  response: unknown;
  usage: unknown;
  error_kind: string | null;
  model: string | null;
  request_config_sha256: string;
  latency_ms: number;
}

export interface RequestStore {
  // True when a devices row exists for this user id (the app registers the device; see migrations).
  deviceRegistered(deviceId: string): Promise<boolean>;
  // created_at values (ISO strings, oldest first, at most `limit`) of counted rows since sinceIso.
  // deviceId null means all devices.
  recentCounted(sinceIso: string, deviceId: string | null, limit: number): Promise<string[]>;
  insert(row: RequestRow): Promise<void>;
}

// Supabase adapter. `admin` is a supabase-js client with the service role.
// deno-lint-ignore no-explicit-any
export function supabaseStore(admin: any): RequestStore {
  return {
    async deviceRegistered(deviceId) {
      const { data, error } = await admin.from("devices").select("id").eq("id", deviceId).maybeSingle();
      if (error) throw new Error(`devices read failed: ${error.code ?? "unknown"}`);
      return data !== null;
    },
    async recentCounted(sinceIso, deviceId, limit) {
      let q = admin
        .from("parse_requests")
        .select("created_at")
        .in("http_status", [...COUNTED_STATUSES])
        // A plain neq would drop NULL error_kind rows, so the null case is spelled out.
        .or(`error_kind.is.null,error_kind.neq.${LOCAL_RATE_LIMIT_KIND}`)
        .gt("created_at", sinceIso) // exclusive: a row exactly 60 s old has left the window (as server/src/rateLimit.js)
        .order("created_at", { ascending: true })
        .limit(limit);
      if (deviceId !== null) q = q.eq("device_id", deviceId);
      const { data, error } = await q;
      if (error) throw new Error(`parse_requests read failed: ${error.code ?? "unknown"}`);
      return (data as { created_at: string }[]).map((r) => r.created_at);
    },
    async insert(row) {
      const { error } = await admin.from("parse_requests").insert(row);
      if (error) throw new Error(`parse_requests insert failed: ${error.code ?? "unknown"}`);
    },
  };
}
