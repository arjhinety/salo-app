/**
 * The database operations of a two-phone session (M5, decision D-06), behind one interface so the session logic can be
 * tested with a fake bus and run against the real project in the Node integration test.
 *
 * The supabase-js implementation below uses only the client it is given: no Expo or native module is imported, so the
 * Node test can use it with its own client. Every call throws a SessionError; "network" means keep it and try again.
 */
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import type { DriverId, EngineInput, PolicyId } from '../engine/types';
import type { SessionInput, SharedClock } from '../live/evening';

export type SessionErrorKind = 'network' | 'refused' | 'not-found';

export class SessionError extends Error {
  constructor(
    readonly kind: SessionErrorKind,
    message: string,
  ) {
    super(message);
    this.name = 'SessionError';
  }
}

/** One live session as the database holds it. `joinCode` is null for everyone but the creator (the dashboard). */
export interface SessionRow {
  id: string;
  eveningId: string;
  policy: PolicyId;
  createdBy: string;
  endedAt: string | null;
  joinCode: string | null;
  clock: SharedClock;
  heldDrivers: DriverId[];
}

/** A request from a phone that is not the dashboard. `input` is what the phone sent (checked by the database). */
export interface RequestRow {
  id: number;
  sessionId: string;
  deviceId: string;
  input: unknown;
  status: 'pending' | 'applied' | 'rejected';
  appliedSeq: number | null;
  reason: string | null;
}

export type RequestOutcome = { status: 'applied'; appliedSeq: number } | { status: 'rejected'; reason: string };

/** The clock fields the dashboard writes. `updatedAt` is an ISO time from the dashboard's phone. */
export interface ClockWrite {
  minute: number;
  running: boolean;
  secondsPerMinute: number;
  updatedAt: string;
}

/** A driver phone that joined a session, as the creator reads it through session_driver_members(). */
export interface DriverMember {
  deviceId: string;
  driverId: DriverId;
}

export interface SessionHandlers {
  /** The session row changed (clock, held drivers, end). */
  onSession?: (row: SessionRow) => void;
  /** A new row of the input log. */
  onInput?: (input: SessionInput) => void;
  /** A new request (the dashboard reads the pending ones). */
  onRequest?: () => void;
  /** The realtime channel is up (`live`) or down (`down`, for example offline). */
  onStatus?: (status: 'live' | 'down') => void;
}

export interface SessionApi {
  /** join_session(code): makes this device a member and returns the session id. */
  join(code: string): Promise<string>;
  readSession(id: string): Promise<SessionRow | null>;
  /** Every input row of the session, in seq order. */
  readInputs(id: string): Promise<SessionInput[]>;
  /** Creator only: the shared clock. */
  writeClock(id: string, clock: ClockWrite): Promise<void>;
  /** Creator only: held_drivers (the database allows it only at 17:00 with the clock stopped). */
  writeHeld(id: string, heldDrivers: readonly DriverId[]): Promise<void>;
  /** Creator only: the driver phones that joined the session, through the session_driver_members() RPC. */
  readDriverMembers(id: string): Promise<DriverMember[]>;
  /** Creator only: appends one input. A repeated send of the same seq is harmless. */
  appendInput(id: string, seq: number, atMinute: number, input: EngineInput): Promise<void>;
  /** Creator only: the requests still pending in the session, oldest first. */
  readPendingRequests(id: string): Promise<RequestRow[]>;
  /** Creator only: marks one request applied (with its seq) or rejected (with the reason). */
  markRequest(id: string, requestId: number, outcome: RequestOutcome): Promise<void>;
  /** A member asks the dashboard for an input. Returns the request id. */
  insertRequest(id: string, input: unknown): Promise<number>;
  /** This device's own requests in the session, oldest first. */
  readOwnRequests(id: string): Promise<RequestRow[]>;
  /** Realtime for one session. Returns the unsubscribe function. */
  subscribe(id: string, handlers: SessionHandlers): () => void;
}

const NETWORK_MARKERS = /fetch|network|timeout|timed out|aborted|socket|offline|ECONN|ENOTFOUND/i;

/** Maps a supabase-js error to a SessionError. A PostgREST or Postgres code means the server refused it. */
export function toSessionError(error: unknown, context: string): SessionError {
  if (error instanceof SessionError) return error;
  const e = error as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === 'string' ? e.code : '';
  const message = typeof e?.message === 'string' ? e.message : String(error);
  if (code === 'P0002') return new SessionError('not-found', `${context}: ${message}`);
  if (code !== '' && !code.startsWith('PGRST000')) return new SessionError('refused', `${context}: ${message}`);
  if (NETWORK_MARKERS.test(message) || error instanceof TypeError) return new SessionError('network', `${context}: ${message}`);
  return new SessionError('network', `${context}: ${message}`);
}

/** Runs one query and turns its `{ error }` into a thrown SessionError. */
async function check<T>(context: string, call: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  let res: { data: T; error: unknown };
  try {
    res = await call;
  } catch (error) {
    throw toSessionError(error, context);
  }
  if (res.error) throw toSessionError(res.error, context);
  return res.data;
}

/** Maps a live_sessions row (snake_case from the database) to a SessionRow. */
export function sessionRowFrom(r: Record<string, unknown>): SessionRow {
  const updated = typeof r.clock_updated_at === 'string' ? Date.parse(r.clock_updated_at) : NaN;
  return {
    id: String(r.id),
    eveningId: String(r.evening_id),
    policy: r.policy as PolicyId,
    createdBy: String(r.created_by),
    endedAt: typeof r.ended_at === 'string' ? r.ended_at : null,
    joinCode: typeof r.join_code === 'string' ? r.join_code : null,
    clock: {
      minute: Number(r.clock_minute),
      running: r.clock_running === true,
      secondsPerMinute: Number(r.seconds_per_minute),
      updatedAtMs: Number.isFinite(updated) ? updated : Date.now(),
    },
    heldDrivers: Array.isArray(r.held_drivers) ? (r.held_drivers as DriverId[]) : [],
  };
}

export function requestRowFrom(r: Record<string, unknown>): RequestRow {
  return {
    id: Number(r.id),
    sessionId: String(r.session_id),
    deviceId: String(r.device_id),
    input: r.input,
    status: r.status as RequestRow['status'],
    appliedSeq: r.applied_seq === null || r.applied_seq === undefined ? null : Number(r.applied_seq),
    reason: typeof r.reason === 'string' ? r.reason : null,
  };
}

const SESSION_COLUMNS =
  'id, evening_id, policy, created_by, ended_at, join_code, clock_minute, clock_running, seconds_per_minute, clock_updated_at, held_drivers';
const REQUEST_COLUMNS = 'id, session_id, device_id, input, status, applied_seq, reason';

/**
 * The supabase-js implementation. `userId` is the signed-in user's id, used as device_id for new requests. Realtime uses
 * one channel per subscription, removed when unsubscribed.
 */
export function makeSupabaseSessionApi(client: SupabaseClient, userId: () => string | null): SessionApi {
  return {
    async join(code) {
      const id = await check<string>(
        'join_session',
        client.rpc('join_session', { p_code: code }) as unknown as PromiseLike<{ data: string; error: unknown }>,
      );
      return id;
    },

    async readSession(id) {
      const rows = await check<Record<string, unknown>[] | null>(
        'read session',
        client.from('live_sessions').select(SESSION_COLUMNS).eq('id', id).limit(1),
      );
      const row = rows?.[0];
      return row ? sessionRowFrom(row) : null;
    },

    async readInputs(id) {
      const rows = await check<{ seq: number; at_minute: number; input: EngineInput }[] | null>(
        'read inputs',
        client.from('session_inputs').select('seq, at_minute, input').eq('session_id', id).order('seq').limit(5000),
      );
      return (rows ?? []).map((r) => ({ seq: r.seq, atMinute: r.at_minute, input: r.input }));
    },

    async writeClock(id, clock) {
      await check<unknown>(
        'write clock',
        client
          .from('live_sessions')
          .update({
            clock_minute: clock.minute,
            clock_running: clock.running,
            seconds_per_minute: clock.secondsPerMinute,
            clock_updated_at: clock.updatedAt,
          })
          .eq('id', id)
          .select('id'),
      );
    },

    async writeHeld(id, heldDrivers) {
      await check<unknown>('write held drivers', client.from('live_sessions').update({ held_drivers: [...heldDrivers] }).eq('id', id).select('id'));
    },

    async readDriverMembers(id) {
      type Raw = { device_id: string; driver_id: string; joined_at: string };
      const rows = await check<Raw[] | null>(
        'read driver members',
        client.rpc('session_driver_members', { p_session: id }) as unknown as PromiseLike<{ data: Raw[] | null; error: unknown }>,
      );
      return (rows ?? []).map((r) => ({ deviceId: r.device_id, driverId: r.driver_id as DriverId }));
    },

    async appendInput(id, seq, atMinute, input) {
      await check<unknown>(
        'append input',
        client
          .from('session_inputs')
          .upsert(
            { session_id: id, seq, at_minute: atMinute, input },
            { onConflict: 'session_id,seq', ignoreDuplicates: true },
          ),
      );
    },

    async readPendingRequests(id) {
      const rows = await check<Record<string, unknown>[] | null>(
        'read requests',
        client.from('input_requests').select(REQUEST_COLUMNS).eq('session_id', id).eq('status', 'pending').order('id').limit(500),
      );
      return (rows ?? []).map(requestRowFrom);
    },

    async markRequest(id, requestId, outcome) {
      const values =
        outcome.status === 'applied'
          ? { status: 'applied', applied_seq: outcome.appliedSeq, reason: null }
          : { status: 'rejected', applied_seq: null, reason: outcome.reason.slice(0, 300) };
      await check<unknown>(
        'mark request',
        client.from('input_requests').update(values).eq('id', requestId).eq('session_id', id).eq('status', 'pending').select('id'),
      );
    },

    async insertRequest(id, input) {
      const me = userId();
      if (me === null) throw new SessionError('network', 'insert request: no signed-in user yet');
      const rows = await check<{ id: number }[] | null>(
        'insert request',
        client.from('input_requests').insert({ session_id: id, device_id: me, input }).select('id'),
      );
      const row = rows?.[0];
      if (!row) throw new SessionError('refused', 'insert request: no row returned');
      return Number(row.id);
    },

    async readOwnRequests(id) {
      const me = userId();
      if (me === null) return [];
      const rows = await check<Record<string, unknown>[] | null>(
        'read own requests',
        client.from('input_requests').select(REQUEST_COLUMNS).eq('session_id', id).eq('device_id', me).order('id').limit(500),
      );
      return (rows ?? []).map(requestRowFrom);
    },

    subscribe(id, handlers) {
      const channel: RealtimeChannel = client.channel(`session:${id}:${Math.random().toString(36).slice(2, 8)}`);
      if (handlers.onSession) {
        const onSession = handlers.onSession;
        channel.on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'live_sessions', filter: `id=eq.${id}` },
          (payload: { new: Record<string, unknown> }) => onSession(sessionRowFrom(payload.new)),
        );
      }
      if (handlers.onInput) {
        const onInput = handlers.onInput;
        channel.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'session_inputs', filter: `session_id=eq.${id}` },
          (payload: { new: { seq: number; at_minute: number; input: EngineInput } }) =>
            onInput({ seq: payload.new.seq, atMinute: payload.new.at_minute, input: payload.new.input }),
        );
      }
      if (handlers.onRequest) {
        const onRequest = handlers.onRequest;
        channel.on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'input_requests', filter: `session_id=eq.${id}` },
          () => onRequest(),
        );
      }
      channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') handlers.onStatus?.('live');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') handlers.onStatus?.('down');
      });
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
