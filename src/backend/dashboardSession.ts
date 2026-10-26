/**
 * The dashboard phone's side of a two-phone session (M5, decision D-06). The dashboard is authoritative:
 * - it writes the shared clock (on start, pause, seek, speed change and rewind, plus a heartbeat every 10 s while running);
 * - it appends every input of its run to session_inputs, in order, with the next seq;
 * - it applies the pending input_requests of its session: stamps each at its current minute through the LiveEvening
 *   methods, then marks the request applied (with its seq) or rejected (with the reason);
 * - it sets held_drivers at 17:00 with the clock stopped, before the evening starts.
 *
 * Writes that matter for the replay (inputs, request outcomes) go through one ordered queue, so the database sees them in
 * the order they were made. A network failure keeps the job and the next pass retries it. The clock is written
 * latest-wins. Nothing here changes the engine; the LiveEvening does the stamping.
 */
import type { EngineInput, DriverId } from '../engine/types';
import type { LiveEvening } from '../live/evening';
import type { RunView } from './eveningSync';
import { draftFromRequest, isDriverAnswer, type RequestInput } from './requests';
import { SessionError, type RequestOutcome, type RequestRow, type SessionApi } from './sessionApi';

/** The clock heartbeat while it runs (protocol: every 10 s). */
export const HEARTBEAT_MS = 10_000;

/** What the dashboard reads from the store. */
export type DashboardLive = Pick<
  LiveEvening,
  'getSnapshot' | 'subscribe' | 'inputLog' | 'postLot' | 'answerDriver' | 'answerProblems' | 'setSessionHeld' | 'heldDrivers'
>;

export interface DashboardStatus {
  sessionId: string | null;
  /** The 6-character code followers type. Null until the creator can read it back from the database. */
  joinCode: string | null;
  /** Shown to the presenter when something could not be sent. Null when all is well. */
  warning: string | null;
}

type Job =
  | { kind: 'append'; sessionId: string; seq: number; atMinute: number; input: EngineInput }
  | { kind: 'mark'; sessionId: string; requestId: number; outcome: RequestOutcome };

export interface DashboardOptions {
  api: SessionApi;
  live: DashboardLive;
  now?: () => number;
  /** The clock's wall time, as an ISO string for the database. */
  isoNow?: () => string;
}

export class DashboardSession {
  private run: RunView | null = null;
  /** The session the appends and requests belong to, once its row is in the database. */
  private active: string | null = null;
  /** Inputs of the run already queued for the database (the next seq is cursor + 1). */
  private cursor = 0;
  private joinCode: string | null = null;
  private warning: string | null = null;
  private readonly queue: Job[] = [];
  private draining = false;
  private applying = false;
  private readonly handled = new Set<number>();
  private unsubscribe: (() => void) | null = null;
  private unsubscribeLive: (() => void) | null = null;
  private clockWritten: { minute: number; running: boolean; secondsPerMinute: number } | null = null;
  private clockWrittenAt = 0;
  private clockBusy = false;
  /** A change arrived while a write was in flight. */
  private clockDirty = false;
  /** The last write failed; the next pass tries again. */
  private clockFailed = false;
  private heldFrozen = false;
  private snap: DashboardStatus = { sessionId: null, joinCode: null, warning: null };
  private readonly listeners = new Set<() => void>();
  private readonly now: () => number;
  private readonly isoNow: () => string;

  constructor(private readonly opts: DashboardOptions) {
    this.now = opts.now ?? (() => Date.now());
    this.isoNow = opts.isoNow ?? (() => new Date().toISOString());
  }

  /** Subscribes to the live store, so every change of the run is written. Idempotent. */
  start(): void {
    if (this.unsubscribeLive) return;
    this.unsubscribeLive = this.opts.live.subscribe(() => this.onLive());
  }

  stop(): void {
    this.unsubscribeLive?.();
    this.unsubscribeLive = null;
    this.endActive();
  }

  subscribeStatus = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };

  getStatus = (): DashboardStatus => this.snap;

  /** The sync layer reports the run: opened, synced (its row is in the database), or ended (null). */
  onRun(run: RunView | null): void {
    const prev = this.run;
    this.run = run;
    if (run === null || run.id !== prev?.id) this.endActive();
    if (run !== null && run.synced && this.active !== run.id) this.activate(run.id);
    this.publish();
  }

  /** Called by the loop every few seconds: heartbeat, retries, pending requests, held drivers at 17:00. */
  async pass(): Promise<void> {
    const id = this.active;
    if (id === null) return;
    const snap = this.opts.live.getSnapshot();
    if (this.joinCode === null) void this.readJoinCode(id);
    if (this.clockFailed || (snap.running && this.now() - this.clockWrittenAt >= HEARTBEAT_MS)) void this.writeClock();
    await this.applyPending();
    await this.drain();
    await this.chooseHeldFromRoster();
  }

  /** Sets the drivers held in this session. The store refuses it once the evening has started. */
  setHeldDrivers(driverIds: readonly DriverId[]): { ok: boolean; problems: string[] } {
    const before = this.opts.live.heldDrivers();
    const r = this.opts.live.setSessionHeld(driverIds);
    if (!r.ok) return { ok: false, problems: r.problems };
    if (this.active !== null && !sameDrivers(before, r.value)) this.enqueueHeld(this.active, r.value);
    return { ok: true, problems: [] };
  }

  /** Applies the pending requests of the active session. Never applies one twice in this run. */
  async applyPending(): Promise<void> {
    const id = this.active;
    if (id === null || !this.run?.synced || this.applying) return;
    this.applying = true;
    let rows: RequestRow[];
    try {
      rows = await this.opts.api.readPendingRequests(id);
    } catch (error) {
      this.setWarning(error instanceof SessionError && error.kind === 'network' ? null : messageOf(error));
      return;
    } finally {
      this.applying = false;
    }
    for (const row of rows) {
      if (this.handled.has(row.id) || id !== this.active) continue;
      this.handled.add(row.id);
      const outcome = this.decide(row.input);
      this.queue.push({ kind: 'mark', sessionId: id, requestId: row.id, outcome });
    }
    void this.drain();
  }

  // -------------------------------------------------------------------------

  private activate(id: string): void {
    this.active = id;
    this.cursor = 0;
    this.clockWritten = null;
    this.clockDirty = false;
    this.clockFailed = false;
    this.heldFrozen = false;
    this.unsubscribe = this.opts.api.subscribe(id, { onRequest: () => void this.applyPending() });
    this.appendNew();
    const held = this.opts.live.heldDrivers();
    if (held.length > 0) this.enqueueHeld(id, held);
    void this.writeClock();
    void this.readJoinCode(id);
    this.publish();
  }

  private endActive(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.active = null;
    this.cursor = 0;
    this.joinCode = null;
    this.queue.length = 0;
    this.handled.clear();
    this.clockWritten = null;
    this.clockDirty = false;
    this.clockFailed = false;
    this.warning = null;
  }

  private onLive(): void {
    if (this.active === null) return;
    this.appendNew();
    this.maybeWriteClock();
    this.publish();
  }

  /** Queues every input of the run that is not queued yet, in log order. */
  private appendNew(): void {
    const id = this.active;
    if (id === null) return;
    const log = this.opts.live.inputLog();
    while (this.cursor < log.length) {
      const entry = log[this.cursor];
      this.cursor += 1;
      this.queue.push({ kind: 'append', sessionId: id, seq: this.cursor, atMinute: entry.atMinute, input: entry.input });
    }
    void this.drain();
  }

  private enqueueHeld(sessionId: string, held: readonly DriverId[]): void {
    void this.opts.api
      .writeHeld(sessionId, held)
      .then(() => this.setWarning(null))
      .catch((error: unknown) => this.setWarning(messageOf(error)));
  }

  /** The decision for one request. The input is applied through the store, so the log and the database get the same entry. */
  private decide(raw: unknown): RequestOutcome {
    const input = raw as Partial<RequestInput> | null;
    if (typeof input !== 'object' || input === null) return { status: 'rejected', reason: 'the request has no input' };
    if (input.type === 'LOT_POSTED') {
      const built = draftFromRequest((input as { lot?: unknown }).lot);
      if (!built.ok) return { status: 'rejected', reason: built.problems.join('; ') };
      const before = this.cursor;
      const r = this.opts.live.postLot(built.draft);
      if (!r.ok) return { status: 'rejected', reason: r.problems.join('; ') };
      return this.applied(before);
    }
    if (input.type === 'DRIVER_RESPONSE') {
      const d = input as { driverId?: unknown; lotId?: unknown; answer?: unknown };
      if (typeof d.driverId !== 'string' || typeof d.lotId !== 'string' || !isDriverAnswer(d.answer)) {
        return { status: 'rejected', reason: 'the driver answer is not complete' };
      }
      const problems = this.opts.live.answerProblems(d.lotId, d.driverId as DriverId);
      if (problems.length > 0) return { status: 'rejected', reason: problems.join('; ') };
      const before = this.cursor;
      this.opts.live.answerDriver(d.lotId, d.driverId as DriverId, d.answer);
      return this.applied(before);
    }
    return { status: 'rejected', reason: 'this kind of input is not sent by a phone' };
  }

  /** The request was stamped only if the store logged exactly one more input. */
  private applied(before: number): RequestOutcome {
    if (this.cursor !== before + 1) return { status: 'rejected', reason: 'the input could not be logged' };
    return { status: 'applied', appliedSeq: this.cursor };
  }

  /** Runs the queue in order. Stops at the first network failure; the next pass tries again. */
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.queue.length > 0) {
        const job = this.queue[0];
        if (job.sessionId !== this.active) {
          this.queue.shift();
          continue;
        }
        try {
          if (job.kind === 'append') {
            await this.opts.api.appendInput(job.sessionId, job.seq, job.atMinute, job.input);
          } else {
            await this.opts.api.markRequest(job.sessionId, job.requestId, job.outcome);
          }
          this.queue.shift();
          this.setWarning(null);
        } catch (error) {
          if (error instanceof SessionError && error.kind === 'network') {
            this.setWarning(null);
            break;
          }
          // The server refused it for good. It is dropped and shown to the presenter; the replay on the phones
          // will not contain it.
          this.queue.shift();
          this.setWarning(messageOf(error));
        }
      }
    } finally {
      this.draining = false;
    }
  }

  private maybeWriteClock(): void {
    const snap = this.opts.live.getSnapshot();
    const last = this.clockWritten;
    const same =
      last !== null &&
      last.running === snap.running &&
      last.secondsPerMinute === snap.secondsPerMinute &&
      (snap.running || last.minute === snap.minute);
    if (!same) void this.writeClock();
  }

  /**
   * Writes the clock as the store has it now. One write at a time. A change made during a write is written after it. A
   * failed write is not retried here: the next pass retries it (clockFailed), so an offline phone does not loop.
   */
  private async writeClock(): Promise<void> {
    const id = this.active;
    if (id === null) return;
    if (this.clockBusy) {
      this.clockDirty = true;
      return;
    }
    this.clockBusy = true;
    try {
      do {
        this.clockDirty = false;
        const snap = this.opts.live.getSnapshot();
        this.clockWrittenAt = this.now();
        this.clockWritten = { minute: snap.minute, running: snap.running, secondsPerMinute: snap.secondsPerMinute };
        try {
          await this.opts.api.writeClock(id, {
            minute: snap.minute,
            running: snap.running,
            secondsPerMinute: snap.secondsPerMinute,
            updatedAt: this.isoNow(),
          });
          this.clockFailed = false;
          this.setWarning(null);
        } catch (error) {
          this.clockFailed = true;
          this.setWarning(messageOf(error));
          break;
        }
      } while (this.clockDirty && this.active === id);
    } finally {
      this.clockBusy = false;
    }
  }

  private async readJoinCode(id: string): Promise<void> {
    try {
      const row = await this.opts.api.readSession(id);
      if (row && this.active === id && row.joinCode) {
        this.joinCode = row.joinCode;
        this.publish();
      }
    } catch {
      // Offline or not yet visible: the next pass asks again.
    }
  }

  /**
   * At 17:00 with the clock stopped, before the start: held drivers = the driver phones that joined (session_driver_members).
   * Once only.
   */
  private async chooseHeldFromRoster(): Promise<void> {
    const id = this.active;
    const snap = this.opts.live.getSnapshot();
    if (id === null || this.heldFrozen || snap.running || snap.minute !== 1020) return;
    try {
      const members = await this.opts.api.readDriverMembers(id);
      const drivers = [...new Set(members.map((m) => m.driverId))];
      const r = this.setHeldDrivers(drivers);
      if (!r.ok) this.heldFrozen = true;
    } catch {
      // Not readable (or offline): try again on the next pass.
    }
  }

  private setWarning(text: string | null): void {
    if (this.warning === text) return;
    this.warning = text;
    this.publish();
  }

  private publish(): void {
    this.snap = { sessionId: this.active, joinCode: this.joinCode, warning: this.warning };
    for (const l of this.listeners) l();
  }
}

function sameDrivers(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
