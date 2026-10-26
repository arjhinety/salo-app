/**
 * An in-memory stand-in for the session tables, the join_session RPC and Realtime, for the session tests. It applies the
 * same rules as the migration (20261026110000_two_phone_sync.sql): creator-only writes, members-only reads, a role check on
 * requests, held drivers only at 17:00 with the clock stopped, and seq unique per session. It is not a database: no SQL,
 * no timing. The Node integration test runs the same code against the real project.
 */
import type { DriverId, EngineInput, PolicyId } from '../../engine/types';
import type { SessionInput } from '../../live/evening';
import {
  SessionError,
  type ClockWrite,
  type DriverMember,
  type RequestOutcome,
  type RequestRow,
  type SessionApi,
  type SessionHandlers,
  type SessionRow,
} from '../sessionApi';

interface Device {
  role: 'donor' | 'pantry' | 'driver' | 'dashboard';
  profileId: string | null;
}

interface Stored {
  row: SessionRow;
  members: Set<string>;
  inputs: SessionInput[];
}

interface Sub {
  userId: string;
  sessionId: string;
  handlers: SessionHandlers;
}

export class FakeSessionBus {
  readonly devices = new Map<string, Device>();
  private readonly sessions = new Map<string, Stored>();
  private readonly codes = new Map<string, string>();
  private readonly requests: (RequestRow & { auth: string })[] = [];
  private readonly subs = new Set<Sub>();
  private nextSession = 1;
  private nextRequest = 1;
  /** When false, every call and every realtime delivery fails or stops, as with no network. */
  online = true;
  /** Every write the database accepted, in order (for the tests that count writes). */
  readonly accepted: string[] = [];

  registerDevice(userId: string, role: Device['role'], profileId: string | null): void {
    this.devices.set(userId, { role, profileId });
  }

  createSession(creatorId: string, opts: { policy?: PolicyId; code: string; now?: number } = { code: 'ABC123' }): SessionRow {
    const id = `sess-${this.nextSession++}`;
    const row: SessionRow = {
      id,
      eveningId: 'E05',
      policy: opts.policy ?? 'salo',
      createdBy: creatorId,
      endedAt: null,
      joinCode: opts.code,
      clock: { minute: 1020, running: false, secondsPerMinute: 6, updatedAtMs: opts.now ?? 0 },
      heldDrivers: [],
    };
    this.sessions.set(id, { row, members: new Set(), inputs: [] });
    this.codes.set(opts.code, id);
    return row;
  }

  /** The stored row, for assertions. */
  row(id: string): SessionRow {
    return this.sessions.get(id)!.row;
  }

  /** The stored input rows, for assertions. */
  storedInputs(id: string): SessionInput[] {
    return this.sessions.get(id)!.inputs.map((i) => ({ ...i }));
  }

  requestsOf(id: string): RequestRow[] {
    return this.requests.filter((r) => r.sessionId === id).map(({ auth: _auth, ...r }) => r);
  }

  /** The dashboard (or a test) ends the session. */
  endSession(id: string, at: string): void {
    this.sessions.get(id)!.row.endedAt = at;
    this.emitSession(id);
  }

  setOnline(online: boolean): void {
    this.online = online;
    for (const sub of this.subs) {
      if (sub.sessionId) sub.handlers.onStatus?.(online ? 'live' : 'down');
    }
  }

  /** The SessionApi as seen by one signed-in user. */
  api(userId: string): SessionApi {
    return new BusApi(this, userId);
  }

  // -------------------------------------------------------------------------
  // used by BusApi
  // -------------------------------------------------------------------------

  ensureOnline(): void {
    if (!this.online) throw new SessionError('network', 'fetch failed: offline');
  }

  refuse(message: string): never {
    throw new SessionError('refused', message);
  }

  join(userId: string, code: string): string {
    this.ensureOnline();
    if (!this.devices.has(userId)) this.refuse('join_session: register the device first');
    const id = this.codes.get(code.trim().toUpperCase());
    if (!id) throw new SessionError('not-found', 'join_session: no session has that code');
    this.sessions.get(id)!.members.add(userId);
    return id;
  }

  isMember(userId: string, id: string): boolean {
    return this.sessions.get(id)?.members.has(userId) === true;
  }

  isCreator(userId: string, id: string): boolean {
    return this.sessions.get(id)?.row.createdBy === userId;
  }

  readSession(userId: string, id: string): SessionRow | null {
    this.ensureOnline();
    const s = this.sessions.get(id);
    if (!s || (!this.isCreator(userId, id) && !this.isMember(userId, id))) return null;
    return { ...s.row, clock: { ...s.row.clock }, heldDrivers: [...s.row.heldDrivers], joinCode: this.isCreator(userId, id) ? s.row.joinCode : null };
  }

  readInputs(userId: string, id: string): SessionInput[] {
    this.ensureOnline();
    if (!this.isCreator(userId, id) && !this.isMember(userId, id)) return [];
    return this.storedInputs(id).sort((a, b) => a.seq - b.seq);
  }

  writeClock(userId: string, id: string, clock: ClockWrite): void {
    this.ensureOnline();
    if (!this.isCreator(userId, id)) this.refuse('write clock: not the creator');
    const s = this.sessions.get(id)!;
    s.row.clock = {
      minute: clock.minute,
      running: clock.running,
      secondsPerMinute: clock.secondsPerMinute,
      updatedAtMs: Date.parse(clock.updatedAt),
    };
    this.accepted.push(`clock:${clock.minute}:${clock.running}`);
    this.emitSession(id);
  }

  writeHeld(userId: string, id: string, held: readonly DriverId[]): void {
    this.ensureOnline();
    if (!this.isCreator(userId, id)) this.refuse('write held drivers: not the creator');
    const s = this.sessions.get(id)!;
    const changes = [...held].sort().join(',') !== [...s.row.heldDrivers].sort().join(',');
    if (changes && (s.row.clock.minute !== 1020 || s.row.clock.running)) {
      this.refuse('live_sessions: held_drivers can change only while the clock is at 1020 and stopped');
    }
    s.row.heldDrivers = [...held];
    this.accepted.push(`held:${held.join(',')}`);
    this.emitSession(id);
  }

  /** session_driver_members(): creator only; the joined driver devices with their driver ids. */
  readDriverMembers(userId: string, id: string): DriverMember[] {
    this.ensureOnline();
    if (!this.isCreator(userId, id)) this.refuse('session_driver_members: only the session creator can read its members');
    const s = this.sessions.get(id)!;
    const out: DriverMember[] = [];
    for (const deviceId of s.members) {
      const d = this.devices.get(deviceId);
      if (d?.role === 'driver' && d.profileId) out.push({ deviceId, driverId: d.profileId as DriverId });
    }
    return out;
  }

  appendInput(userId: string, id: string, seq: number, atMinute: number, input: EngineInput): void {
    this.ensureOnline();
    if (!this.isCreator(userId, id)) this.refuse('session_inputs: not the creator');
    const s = this.sessions.get(id)!;
    if (s.inputs.some((i) => i.seq === seq)) return; // ON CONFLICT DO NOTHING
    const row: SessionInput = { seq, atMinute, input: JSON.parse(JSON.stringify(input)) as EngineInput };
    s.inputs.push(row);
    this.accepted.push(`input:${seq}:${input.type}`);
    for (const sub of this.subs) {
      if (sub.sessionId === id && (this.isCreator(sub.userId, id) || this.isMember(sub.userId, id))) {
        sub.handlers.onInput?.({ ...row, input: JSON.parse(JSON.stringify(row.input)) as EngineInput });
      }
    }
  }

  readPendingRequests(userId: string, id: string): RequestRow[] {
    this.ensureOnline();
    if (!this.isCreator(userId, id)) return [];
    return this.requestsOf(id).filter((r) => r.status === 'pending');
  }

  markRequest(userId: string, id: string, requestId: number, outcome: RequestOutcome): void {
    this.ensureOnline();
    if (!this.isCreator(userId, id)) this.refuse('input_requests: not the creator');
    const r = this.requests.find((x) => x.id === requestId && x.sessionId === id);
    if (!r || r.status !== 'pending') return;
    if (outcome.status === 'applied') {
      const applied = this.sessions.get(id)!.inputs.some((i) => i.seq === outcome.appliedSeq);
      if (!applied) this.refuse('input_requests_applied_seq_fk: no such seq');
      r.status = 'applied';
      r.appliedSeq = outcome.appliedSeq;
    } else {
      r.status = 'rejected';
      r.reason = outcome.reason.slice(0, 300);
    }
    this.accepted.push(`request:${requestId}:${outcome.status}`);
  }

  insertRequest(userId: string, id: string, input: unknown): number {
    this.ensureOnline();
    const device = this.devices.get(userId);
    if (!device || !this.isMember(userId, id)) this.refuse('input_requests: not a member of this session');
    const i = input as { type?: string; lot?: { donorId?: string }; driverId?: string };
    const s = this.sessions.get(id)!;
    // A DRIVER_RESPONSE needs a driver device whose driver id the session holds (migration 20261026120000).
    const driverHeld = device.role === 'driver' && device.profileId !== null && s.row.heldDrivers.includes(device.profileId);
    const allowed =
      (device.role === 'donor' && i.type === 'LOT_POSTED' && i.lot?.donorId === device.profileId) ||
      (device.role === 'driver' && i.type === 'DRIVER_RESPONSE' && i.driverId === device.profileId && driverHeld) ||
      (device.role === 'dashboard' && i.type !== 'DRIVER_RESPONSE');
    if (!allowed) this.refuse('input_requests: this role may not send that input');
    const row = {
      id: this.nextRequest++,
      sessionId: id,
      deviceId: userId,
      input,
      status: 'pending' as const,
      appliedSeq: null,
      reason: null,
      auth: userId,
    };
    this.requests.push(row);
    this.accepted.push(`request-in:${row.id}`);
    for (const sub of this.subs) {
      if (sub.sessionId === id && this.isCreator(sub.userId, id)) sub.handlers.onRequest?.();
    }
    return row.id;
  }

  readOwnRequests(userId: string, id: string): RequestRow[] {
    this.ensureOnline();
    return this.requestsOf(id).filter((r) => r.deviceId === userId);
  }

  subscribe(userId: string, id: string, handlers: SessionHandlers): () => void {
    const sub: Sub = { userId, sessionId: id, handlers };
    this.subs.add(sub);
    handlers.onStatus?.(this.online ? 'live' : 'down');
    return () => {
      this.subs.delete(sub);
    };
  }

  private emitSession(id: string): void {
    const s = this.sessions.get(id)!;
    for (const sub of this.subs) {
      if (sub.sessionId === id && (this.isCreator(sub.userId, id) || this.isMember(sub.userId, id))) {
        sub.handlers.onSession?.({ ...s.row, clock: { ...s.row.clock }, heldDrivers: [...s.row.heldDrivers] });
      }
    }
  }
}

class BusApi implements SessionApi {
  constructor(
    private readonly bus: FakeSessionBus,
    private readonly userId: string,
  ) {}

  async join(code: string): Promise<string> {
    return this.bus.join(this.userId, code);
  }
  async readSession(id: string): Promise<SessionRow | null> {
    return this.bus.readSession(this.userId, id);
  }
  async readInputs(id: string): Promise<SessionInput[]> {
    return this.bus.readInputs(this.userId, id);
  }
  async writeClock(id: string, clock: ClockWrite): Promise<void> {
    this.bus.writeClock(this.userId, id, clock);
  }
  async writeHeld(id: string, heldDrivers: readonly DriverId[]): Promise<void> {
    this.bus.writeHeld(this.userId, id, heldDrivers);
  }
  async readDriverMembers(id: string): Promise<DriverMember[]> {
    return this.bus.readDriverMembers(this.userId, id);
  }
  async appendInput(id: string, seq: number, atMinute: number, input: EngineInput): Promise<void> {
    this.bus.appendInput(this.userId, id, seq, atMinute, input);
  }
  async readPendingRequests(id: string): Promise<RequestRow[]> {
    return this.bus.readPendingRequests(this.userId, id);
  }
  async markRequest(id: string, requestId: number, outcome: RequestOutcome): Promise<void> {
    this.bus.markRequest(this.userId, id, requestId, outcome);
  }
  async insertRequest(id: string, input: unknown): Promise<number> {
    return this.bus.insertRequest(this.userId, id, input);
  }
  async readOwnRequests(id: string): Promise<RequestRow[]> {
    return this.bus.readOwnRequests(this.userId, id);
  }
  subscribe(id: string, handlers: SessionHandlers): () => void {
    return this.bus.subscribe(this.userId, id, handlers);
  }
}

/**
 * The digest the two-phone tests compare: the visible log as canonical JSON (object keys sorted). The database stores
 * jsonb, which reorders keys, so two equal logs must not be compared as raw JSON strings.
 */
export function digestOf(log: readonly { seq?: number; atMinute: number; event: unknown }[]): string {
  return JSON.stringify(canonical(log));
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === 'object') {
    const o = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, canonical(o[k])]));
  }
  return value;
}
