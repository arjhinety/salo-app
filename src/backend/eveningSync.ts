/**
 * Copies what the single phone's evening produces into the database (decision "everything in db").
 *
 * A "run" is one live_sessions row: one evening, one policy, one input history. A run starts when the dashboard user is
 * signed in (the start of the evening, and each "Replay with baseline"). It ends, and a new run opens, when:
 * - the clock goes back (a seek or a replay, which rewinds to 17:00),
 * - the policy changes,
 * - an entry already uploaded no longer matches the engine's log (a cancel changed the past), or
 * - the dashboard user changes (the phone was signed out and signed in again as the dashboard).
 *
 * Events are uploaded only for entries before the clock minute, in seq order, never twice. Lots are uploaded for every
 * LOT_POSTED input of the run, including ones posted before the run opened (they are backfilled). Lots and events go
 * only after the run row has been delivered, so the foreign keys always hold. Every write goes through the outbox, so
 * the clock never waits for the network.
 *
 * The run's lookup is `activeSessionId()`: that is the one place that decides which session a write goes to.
 */
import type { LogEntry, Lot, PolicyId } from '../engine/types';
import type { LiveEvening, TimedInput } from '../live/evening';
import type { OutboxItem, Row } from './outbox';
import type { Role } from './types';

export type LiveLike = Pick<LiveEvening, 'getSnapshot' | 'subscribe' | 'visibleLog' | 'inputLog'>;

export interface Identity {
  /** The signed-in user, or null. */
  userId(): string | null;
  role(): Role | null;
  /** True when the signed-in user has a devices row for the chosen role. */
  registered(): boolean;
}

export interface OutboxLike {
  enqueue(item: Omit<OutboxItem, 'id'>): OutboxItem;
  onDelivered(fn: (item: OutboxItem) => void): () => void;
  onRejected(fn: (item: OutboxItem) => void): () => void;
}

/** Entries to upload now: in seq order, after `lastSeq`, and strictly before the clock minute. Stops at the first later one. */
export function selectUnsent(log: readonly LogEntry[], clockMinute: number, lastSeq: number): LogEntry[] {
  const bySeq = [...log].sort((a, b) => a.seq - b.seq);
  const out: LogEntry[] = [];
  for (const e of bySeq) {
    if (e.seq <= lastSeq) continue;
    if (e.atMinute >= clockMinute) break;
    out.push(e);
  }
  return out;
}

/** True when every entry already uploaded (seq to JSON) is still in the engine's log, unchanged. */
export function prefixIntact(sent: ReadonlyMap<number, string>, log: readonly LogEntry[]): boolean {
  if (sent.size === 0) return true;
  const bySeq = new Map<number, LogEntry>();
  for (const e of log) bySeq.set(e.seq, e);
  for (const [seq, json] of sent) {
    const e = bySeq.get(seq);
    if (!e || JSON.stringify(e) !== json) return false;
  }
  return true;
}

/** The lots posted in the run's inputs that are not uploaded yet, in input order. */
export function unsentLots(inputs: readonly TimedInput[], sentIds: ReadonlySet<string>): Lot[] {
  const out: Lot[] = [];
  for (const t of inputs) {
    if (t.input.type === 'LOT_POSTED' && !sentIds.has(t.input.lot.id)) out.push(t.input.lot);
  }
  return out;
}

export function sessionRow(run: { id: string; evening: string; policy: PolicyId; userId: string; startedAt: string }): Row {
  return {
    id: run.id,
    evening_id: run.evening,
    policy: run.policy,
    created_by: run.userId,
    started_at: run.startedAt,
  };
}

export function eventRows(sessionId: string, policy: PolicyId, batch: readonly LogEntry[]): Row[] {
  return batch.map((e) => ({
    session_id: sessionId,
    seq: e.seq,
    at_minute: e.atMinute,
    policy,
    event: e.event,
  }));
}

export function lotRows(sessionId: string, userId: string, lots: readonly Lot[]): Row[] {
  return lots.map((lot) => ({
    session_id: sessionId,
    lot_id: lot.id,
    donor_id: lot.donorId,
    items: lot.items,
    est_kg: lot.estKg,
    load_units: lot.loadUnits,
    posted_minute: lot.postedMinute,
    pickup_by_minute: lot.pickupByMinute,
    origin: 'live',
    created_by: userId,
  }));
}

/** A random RFC 4122 version 4 id. crypto.randomUUID when the runtime has it, else Math.random (not a secret). */
export function newUuid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = Array.from({ length: 16 }, () => Math.floor(Math.random() * 256));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

interface Run {
  id: string;
  userId: string;
  evening: string;
  policy: PolicyId;
  startedAt: string;
  /** True once the run row has been delivered. Lots and events wait for this. */
  synced: boolean;
  lastSeq: number;
  /** seq to JSON of every entry uploaded in this run (for the prefix check). */
  sent: Map<number, string>;
  lots: Set<string>;
}

export class EveningSync {
  private run: Run | null = null;
  private lastMinute: number | null = null;
  /** Set when the run row was refused for good. Cleared by beginRun(). */
  private failed = false;
  private started = false;

  constructor(
    private readonly live: LiveLike,
    private readonly outbox: OutboxLike,
    private readonly who: Identity,
    private readonly newId: () => string = newUuid,
    private readonly nowIso: () => string = () => new Date().toISOString(),
  ) {}

  /** Subscribes to the evening and to the outbox. Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;
    this.live.subscribe(() => this.reconcile());
    this.outbox.onDelivered((item) => this.delivered(item));
    this.outbox.onRejected((item) => this.rejected(item));
    this.reconcile();
  }

  /** The session every write of this phone goes to right now, or null. */
  activeSessionId(): string | null {
    return this.run?.id ?? null;
  }

  /** "Replay with baseline" (or any new run the user starts): ends the current run; the next reconcile opens a new one. */
  beginRun(): void {
    this.endRun();
    this.failed = false;
  }

  /**
   * Called before the phone signs `userId` out. Writes what is left of the run while that user is still signed in, then
   * ends the run.
   */
  release(userId: string): void {
    if (this.run?.userId !== userId) return;
    this.reconcile();
    this.endRun();
  }

  /** Brings the uploads up to date with the evening. Cheap when nothing changed. */
  reconcile(): void {
    const snap = this.live.getSnapshot();
    const minute = snap.minute;
    const uid = this.who.userId();
    const registered = uid !== null && this.who.registered();
    const dashboardHere = registered && this.who.role() === 'dashboard';

    const current = this.run;
    if (current !== null) {
      const rewound = this.lastMinute !== null && minute < this.lastMinute;
      const changed = snap.policy !== current.policy || !prefixIntact(current.sent, this.live.visibleLog());
      const otherUser = dashboardHere && uid !== current.userId;
      if (rewound || changed || otherUser) this.endRun();
    }
    this.lastMinute = minute;

    if (this.run === null && dashboardHere && !this.failed && uid !== null) {
      this.openRun(uid, snap.eveningId, snap.policy);
    }

    const run = this.run;
    if (run === null || !run.synced || !registered || uid === null) return;

    if (uid === run.userId) {
      const batch = selectUnsent(this.live.visibleLog(), minute, run.lastSeq);
      if (batch.length > 0) {
        this.outbox.enqueue({
          userId: uid,
          table: 'events',
          kind: 'upsert',
          onConflict: 'session_id,seq',
          rows: eventRows(run.id, run.policy, batch),
        });
        for (const e of batch) {
          run.sent.set(e.seq, JSON.stringify(e));
          run.lastSeq = e.seq;
        }
      }
    }

    const lots = unsentLots(this.live.inputLog(), run.lots);
    if (lots.length > 0) {
      this.outbox.enqueue({
        userId: uid,
        table: 'lots',
        kind: 'upsert',
        onConflict: 'session_id,lot_id',
        rows: lotRows(run.id, uid, lots),
      });
      for (const lot of lots) run.lots.add(lot.id);
    }
  }

  private openRun(userId: string, evening: string, policy: PolicyId): void {
    const id = this.newId();
    this.run = {
      id,
      userId,
      evening,
      policy,
      startedAt: this.nowIso(),
      synced: false,
      lastSeq: 0,
      sent: new Map(),
      lots: new Set(),
    };
    this.outbox.enqueue({
      userId,
      table: 'live_sessions',
      kind: 'upsert',
      onConflict: 'id',
      rows: [sessionRow(this.run)],
      tag: `session:${id}`,
    });
  }

  private endRun(): void {
    const run = this.run;
    if (run === null) return;
    this.run = null;
    this.outbox.enqueue({
      userId: run.userId,
      table: 'live_sessions',
      kind: 'update',
      values: { ended_at: this.nowIso() },
      match: { id: run.id },
    });
  }

  private delivered(item: OutboxItem): void {
    const run = this.run;
    if (run !== null && item.tag === `session:${run.id}`) {
      run.synced = true;
      this.reconcile();
    }
  }

  private rejected(item: OutboxItem): void {
    const run = this.run;
    if (run !== null && item.tag === `session:${run.id}`) {
      console.warn('evening sync: the live session row was refused; no more uploads for this run');
      this.run = null;
      this.failed = true;
    }
  }
}
