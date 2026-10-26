/**
 * LiveEvening: one simulated evening played on one phone (milestone M3, architecture 2.5 and 2.9, decision D-06).
 *
 * Pure TypeScript, no React. The state is:
 *   seed + world + evening (fixed) + the input log (LOT_POSTED, CANCEL_DRIVER, each at a simulated minute)
 *   + policy + params.
 * The engine is re-run only when the inputs or the policy change. The clock only decides how much of that
 * run is visible: the log entries with atMinute <= the clock's whole minute.
 *
 * Every evening here is a TUNING evening, labelled simulated. Pilot and main evenings are never played live.
 */
import { EVENINGS, WORLD } from '../data/dataset';
import { UNTUNED_PARAMS } from '../engine/params';
import { runEvening, type RunOutput } from '../engine/simulate';
import type {
  AwardState,
  DonorId,
  DriverAnswer,
  DriverId,
  EngineInput,
  Evening,
  EveningId,
  FrozenParams,
  LogEntry,
  Lot,
  LotId,
  LotItem,
  Minute,
  PolicyId,
  Split,
} from '../engine/types';
import { indexWorld, type WorldIndex } from '../engine/world';
import { foldLotViews, type LotView } from './lotViews';

/** 17:00 in minutes after midnight. */
export const SIM_START_MINUTE: Minute = 17 * 60;
/** 21:30: the clock stops here. */
export const SIM_END_MINUTE: Minute = 21 * 60 + 30;
/** Decision D-k: 6 real seconds per simulated minute (adjustable). */
export const DEFAULT_SECONDS_PER_MINUTE = 6;
/** A tuning evening, labelled simulated in the UI. Never pilot or main. */
export const DEFAULT_EVENING_ID: EveningId = 'E05';

const WX: WorldIndex = indexWorld(WORLD);

/** An outside input and the simulated minute it happened at. */
export interface TimedInput {
  atMinute: Minute;
  input: EngineInput;
}

/** One row of the shared input log (session_inputs): its sequence number, the minute it was stamped at, and the input. */
export interface SessionInput extends TimedInput {
  seq: number;
}

/**
 * The shared clock as the database holds it (live_sessions). `updatedAtMs` is when the dashboard wrote it. While the
 * clock runs, a follower's minute is `minute + elapsed real seconds / secondsPerMinute` (decision D-k).
 */
export interface SharedClock {
  minute: Minute;
  running: boolean;
  secondsPerMinute: number;
  updatedAtMs: number;
}

/** What a donor posts. The phone fills it in; the store adds the id, the minute and the totals. */
export interface LiveLotDraft {
  donorId: DonorId;
  items: readonly LotItem[];
  pickupByMinute: Minute;
}

export type LiveResult<T> = { ok: true; value: T } | { ok: false; problems: string[] };

export interface LiveEveningOptions {
  eveningId?: EveningId;
  policy?: PolicyId;
  /** Defaults to UNTUNED_PARAMS (see the TODO below). */
  params?: FrozenParams;
  secondsPerMinute?: number;
  startMinute?: Minute;
}

/** The small, immutable picture the UI re-renders from. A new object exists only when something changed. */
export interface LiveSnapshot {
  revision: number;
  eveningId: EveningId;
  split: Split;
  date: string;
  policy: PolicyId;
  /** Whole simulated minute shown on the clock. */
  minute: Minute;
  running: boolean;
  ended: boolean;
  secondsPerMinute: number;
  inputCount: number;
}

export class LiveEvening {
  private readonly evening: Evening;
  private readonly params: FrozenParams;
  private policy: PolicyId;
  private inputs: TimedInput[] = [];
  /** Exact simulated minutes; the displayed minute is its floor. */
  private clock: number;
  private running = false;
  private lastTickMs: number | null = null;
  private secondsPerMinute: number;
  private liveCount = 0;
  private revision = 0;
  private snap: LiveSnapshot;
  /** The memoized engine run. Cleared only when the inputs or the policy change. */
  private run: RunOutput | null = null;
  private runs = 0;
  private visibleCache: { revision: number; log: readonly LogEntry[] } | null = null;
  private viewCache = new Map<DonorId, { revision: number; views: LotView[] }>();
  private listeners = new Set<() => void>();
  /** The driver profile a person holds on this phone (decision D-Q5), or none. */
  private held: DriverId | null = null;
  /** The drivers the session holds (held_drivers). The dashboard sets them; a follower reads them from the row. */
  private sessionHeld: DriverId[] = [];
  /** True once the clock has been started on this phone. The held drivers are fixed from then on (decision D-Q5). */
  private startedOnce = false;
  /**
   * Set while this phone follows a session it joined (M5). Then the inputs are exactly the session's rows in seq order,
   * the policy and the held drivers come from its row, and the clock follows the shared clock. Local inputs and the
   * clock controls are not used.
   */
  private following: { inputs: SessionInput[] } | null = null;

  constructor(opts: LiveEveningOptions = {}) {
    const id = opts.eveningId ?? DEFAULT_EVENING_ID;
    const ev = EVENINGS.find((e) => e.id === id);
    if (!ev) throw new Error(`no evening ${id}`);
    if (ev.split !== 'tuning') throw new Error(`live play only runs tuning evenings; ${id} is ${ev.split}`);
    this.evening = ev;
    this.policy = opts.policy ?? 'salo';
    // TODO(M6): replace UNTUNED_PARAMS with the frozen params file once tuning on E01-E10 writes it.
    // Pilot and main runs refuse UNTUNED_PARAMS; this live store is tuning-only, so it may use them.
    this.params = opts.params ?? UNTUNED_PARAMS;
    this.secondsPerMinute = validSpeed(opts.secondsPerMinute ?? DEFAULT_SECONDS_PER_MINUTE);
    this.clock = opts.startMinute ?? SIM_START_MINUTE;
    this.snap = this.makeSnapshot();
  }

  // -------------------------------------------------------------------------
  // Store plumbing (useSyncExternalStore reads these)
  // -------------------------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): LiveSnapshot => this.snap;

  // -------------------------------------------------------------------------
  // Clock
  // -------------------------------------------------------------------------

  /** Starts the clock. Does nothing once the evening has ended. `nowMs` is injectable for tests. */
  start(nowMs: number = Date.now()): void {
    if (this.running || this.ended() || this.following) return;
    this.startedOnce = true;
    this.running = true;
    this.lastTickMs = nowMs;
    this.publish();
  }

  pause(nowMs: number = Date.now()): void {
    if (!this.running || this.following) return;
    this.advanceTo(nowMs);
    this.running = false;
    this.lastTickMs = null;
    this.publish();
  }

  /** Real seconds per simulated minute. Time already elapsed is counted at the old speed. */
  setSpeed(secondsPerMinute: number, nowMs: number = Date.now()): void {
    if (this.following) return;
    const s = validSpeed(secondsPerMinute);
    if (this.running) this.advanceTo(nowMs);
    this.secondsPerMinute = s;
    this.publish();
  }

  /** Advances the clock by the real time since the last tick. Publishes only when the whole minute changes. */
  tick(nowMs: number = Date.now()): void {
    if (!this.running) return;
    const beforeMinute = this.minute();
    this.advanceTo(nowMs);
    if (this.minute() !== beforeMinute || !this.running) this.publish();
  }

  // -------------------------------------------------------------------------
  // Inputs (each one is appended to the log at the current simulated minute)
  // -------------------------------------------------------------------------

  /** A donor posts a lot now. Returns the lot with id LIVE-<n>, posted at the current minute. */
  postLot(draft: LiveLotDraft): LiveResult<Lot> {
    if (this.following) return { ok: false, problems: [FOLLOWER_NO_LOCAL_INPUT] };
    const problems: string[] = [];
    if (!WORLD.donors.some((d) => d.id === draft.donorId)) problems.push(`no donor ${draft.donorId}`);
    if (!(draft.pickupByMinute > this.minute())) problems.push('pickup time must be later than the clock');
    if (draft.items.length === 0) problems.push('a lot needs at least one item');
    if (problems.length) return { ok: false, problems };

    this.liveCount += 1;
    const minute = this.minute();
    const lot: Lot = {
      id: `LIVE-${this.liveCount}`,
      donorId: draft.donorId,
      items: [...draft.items],
      estKg: sum(draft.items.map((i) => i.estKg)),
      loadUnits: sum(draft.items.map((i) => i.loadUnits)),
      postedMinute: minute,
      pickupByMinute: draft.pickupByMinute,
      origin: 'live',
    };
    this.inputs.push({ atMinute: minute, input: { type: 'LOT_POSTED', lot } });
    this.run = null;
    this.publish();
    return { ok: true, value: lot };
  }

  /** The ids the next `count` posts will get, in order. Read-only: nothing is posted. */
  nextLiveIds(count: number): LotId[] {
    if (this.following) return [];
    return Array.from({ length: Math.max(0, count) }, (_, i) => `LIVE-${this.liveCount + 1 + i}`);
  }

  /** Cancel the driver of a lot. Only allowed while that lot is FINAL at the clock (decision D-Q7). */
  cancelDriver(lotId: LotId): LiveResult<LotId> {
    if (this.following) return { ok: false, problems: [FOLLOWER_DASHBOARD_ONLY] };
    const state = this.stateOf(lotId);
    if (state === undefined) return { ok: false, problems: [`lot ${lotId} is not posted yet`] };
    if (state !== 'final') return { ok: false, problems: [`lot ${lotId} is ${state}, not final`] };
    this.inputs.push({ atMinute: this.minute(), input: { type: 'CANCEL_DRIVER', lotId } });
    this.run = null;
    this.publish();
    return { ok: true, value: lotId };
  }

  /**
   * A person holding a driver profile answers a request (decision D-Q5). Logged at the clock like any input. The engine
   * ignores an answer that does not apply (wrong lot, not asked, too late, duplicate).
   */
  answerDriver(lotId: LotId, driverId: DriverId, answer: DriverAnswer): void {
    if (this.following) return;
    this.inputs.push({ atMinute: this.minute(), input: { type: 'DRIVER_RESPONSE', driverId, lotId, answer } });
    this.run = null;
    this.publish();
  }

  /**
   * Holds one driver profile on this phone (decision D-Q5), or releases it with null. The engine asks a held driver
   * in every round it is eligible for and never offers for it; only DRIVER_RESPONSE inputs decide. The memoized run
   * is dropped, so the next read re-runs the evening with the new hold.
   */
  holdDriver(driverId: DriverId | null): void {
    if (driverId === this.held) return;
    this.held = driverId;
    // A follower's own driver profile is only a view: the run uses the session's held drivers (see humanDrivers()).
    if (!this.following) this.run = null;
    this.publish();
  }

  /**
   * The held drivers of the session (the dashboard sets them at 17:00 with the clock stopped, before the clock first
   * starts; the database rule is the same). Returns problems instead of changing anything when that does not hold.
   */
  setSessionHeld(driverIds: readonly DriverId[]): LiveResult<DriverId[]> {
    if (this.following) return { ok: false, problems: [FOLLOWER_DASHBOARD_ONLY] };
    if (this.startedOnce) return { ok: false, problems: ['held drivers are fixed once the evening has started'] };
    if (this.running || this.minute() !== SIM_START_MINUTE) {
      return { ok: false, problems: ['held drivers can be set only at 5:00 PM with the clock stopped'] };
    }
    const next = [...new Set(driverIds)].sort();
    if (!sameIds(next, this.sessionHeld)) {
      this.sessionHeld = next;
      this.run = null;
      this.publish();
    }
    return { ok: true, value: next };
  }

  /** The held drivers of the session, as the run uses them. */
  heldDrivers(): readonly DriverId[] {
    return this.following ? this.sessionHeld : [...this.humanDrivers()];
  }

  /**
   * Why a driver answer cannot be applied to this log, or none. Only what the store can see: the lot is posted and
   * the driver is held. The engine still decides the rest (an answer that does not apply is ignored, and it shows
   * in the log).
   */
  answerProblems(lotId: LotId, driverId: DriverId): string[] {
    const problems: string[] = [];
    if (!this.postedLots().some((l) => l.id === lotId)) problems.push(`lot ${lotId} is not posted yet`);
    if (!this.sessionHeld.includes(driverId)) problems.push(`driver ${driverId} is not held in this session`);
    return problems;
  }

  /** Follower mode (M5): this phone shows a session it has joined. See `following`. */
  isFollower(): boolean {
    return this.following !== null;
  }

  /**
   * Starts following a joined session. The policy and held drivers come from its row, the inputs are its session_inputs
   * rows, and the clock follows the shared clock. Local inputs are kept but not used while following.
   */
  follow(
    session: { policy: PolicyId; heldDrivers: readonly DriverId[] },
    inputs: readonly SessionInput[],
    clock: SharedClock,
    nowMs: number = Date.now(),
  ): void {
    this.following = { inputs: sortBySeq(inputs) };
    this.policy = session.policy;
    this.sessionHeld = [...session.heldDrivers].sort();
    this.run = null;
    this.setFollowedClock(clock, nowMs, false);
    this.publish();
  }

  /** Replaces the followed input log (a realtime insert, or a re-read after a reconnect). */
  followInputs(inputs: readonly SessionInput[]): void {
    if (!this.following) return;
    this.following = { inputs: sortBySeq(inputs) };
    this.run = null;
    this.publish();
  }

  /** New held drivers from the session row (only a dashboard can change them, and only before the start). */
  followHeld(heldDrivers: readonly DriverId[]): void {
    if (!this.following) return;
    const next = [...heldDrivers].sort();
    if (sameIds(next, this.sessionHeld)) return;
    this.sessionHeld = next;
    this.run = null;
    this.publish();
  }

  /**
   * Moves the followed clock to the shared clock. While it runs, the minute is the stored minute plus the real time since
   * the write, divided by the seconds per minute. `running: false` freezes the clock where the shared clock has it.
   */
  followClock(clock: SharedClock, nowMs: number = Date.now()): void {
    if (!this.following) return;
    this.setFollowedClock(clock, nowMs, true);
  }

  private setFollowedClock(clock: SharedClock, nowMs: number, publishNow: boolean): void {
    const spm = validSpeed(clock.secondsPerMinute);
    const elapsedMinutes = clock.running ? Math.max(0, nowMs - clock.updatedAtMs) / 1000 / spm : 0;
    this.secondsPerMinute = spm;
    this.clock = Math.min(SIM_END_MINUTE, clock.minute + elapsedMinutes);
    this.running = clock.running && this.clock < SIM_END_MINUTE;
    this.lastTickMs = this.running ? nowMs : null;
    if (publishNow) this.publish();
  }

  /** Leaves the joined session. This phone goes back to its own inputs; the clock stays where it is, paused. */
  leaveFollow(): void {
    if (!this.following) return;
    this.following = null;
    this.sessionHeld = [];
    this.running = false;
    this.lastTickMs = null;
    this.run = null;
    this.publish();
  }

  /** The driver profile this phone holds right now, or null. Read it on each render, after the snapshot changes. */
  heldDriver(): DriverId | null {
    return this.held;
  }

  /** Switches the policy at the clock, keeping the clock where it is. */
  setPolicy(policy: PolicyId): void {
    if (policy === this.policy || this.following) return;
    this.policy = policy;
    this.run = null;
    this.publish();
  }

  /**
   * "Replay with baseline": the same input log under another policy, from 17:00 and paused, so the panel sees
   * the same evening again from the start. Inputs keep their minutes and appear again as the clock reaches them.
   */
  replayUnder(policy: PolicyId): void {
    if (this.following) return;
    if (policy !== this.policy) {
      this.policy = policy;
      this.run = null;
    }
    this.clock = SIM_START_MINUTE;
    this.running = false;
    this.lastTickMs = null;
    this.publish();
  }

  /**
   * Scrubbing: moves the clock to a whole minute, clamped to 17:00 to 21:30, and pauses the run. Only the visible
   * part of the log changes. The input log and the engine run are untouched.
   */
  seek(minute: Minute): void {
    if (!Number.isFinite(minute)) throw new RangeError(`cannot seek to ${minute}`);
    if (this.following) return;
    this.running = false;
    this.lastTickMs = null;
    this.clock = Math.min(SIM_END_MINUTE, Math.max(SIM_START_MINUTE, Math.round(minute)));
    this.publish();
  }

  // -------------------------------------------------------------------------
  // Selectors (folds of the visible log; cached until the next publish)
  // -------------------------------------------------------------------------

  /** The log entries at or before the clock, in engine order. */
  visibleLog(): readonly LogEntry[] {
    if (this.visibleCache?.revision === this.revision) return this.visibleCache.log;
    const minute = this.minute();
    const log = this.ensureRun().log.filter((e) => e.atMinute <= minute);
    this.visibleCache = { revision: this.revision, log };
    return log;
  }

  /** One donor's lots as the donor sees them. Same object until the next publish. */
  lotViews(donorId: DonorId): LotView[] {
    const hit = this.viewCache.get(donorId);
    if (hit && hit.revision === this.revision) return hit.views;
    const views = foldLotViews(this.postedLots(), this.visibleLog(), donorId);
    this.viewCache.set(donorId, { revision: this.revision, views });
    return views;
  }

  /** Every lot posted by the clock, dataset and live, in posting order. Built fresh; cache it by `revision`. */
  postedLots(): Lot[] {
    const minute = this.minute();
    const lots: Lot[] = this.evening.lots.filter((l) => l.postedMinute <= minute);
    for (const { input } of this.inputsVisible()) if (input.type === 'LOT_POSTED') lots.push(input.lot);
    return lots;
  }

  /** The state of a posted lot at the clock, or undefined if it is not posted yet. */
  stateOf(lotId: LotId): AwardState | undefined {
    let state: AwardState | undefined;
    for (const { event } of this.visibleLog()) {
      if (event.type === 'AWARD_STATE' && event.lotId === lotId) state = event.state;
    }
    return state;
  }

  /** The inputs posted at or before the clock. */
  inputsVisible(): readonly TimedInput[] {
    const minute = this.minute();
    return this.activeInputs().filter((i) => i.atMinute <= minute);
  }

  /** Every input so far, in order. Replaying these with the seed and world reproduces the evening (D-06). */
  inputLog(): readonly TimedInput[] {
    return this.activeInputs();
  }

  /** How many times the engine has been run. Used by tests to check the memoization. */
  get runCount(): number {
    return this.runs;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /**
   * The whole minute shown. The epsilon absorbs float drift from summing fractions of a minute
   * (5/6 + 1/6 can come out as 1020.9999999999999), so the clock never lags a tick behind.
   */
  private minute(): Minute {
    return Math.floor(this.clock + 1e-9);
  }

  private ended(): boolean {
    return this.clock >= SIM_END_MINUTE;
  }

  private advanceTo(nowMs: number): void {
    if (this.lastTickMs !== null) {
      const minutes = Math.max(0, nowMs - this.lastTickMs) / 1000 / this.secondsPerMinute;
      this.clock = Math.min(SIM_END_MINUTE, this.clock + minutes);
    }
    this.lastTickMs = nowMs;
    if (this.ended()) {
      this.running = false;
      this.lastTickMs = null;
    }
  }

  /** The inputs the run uses: the followed session's rows while following, else this phone's own. */
  private activeInputs(): readonly TimedInput[] {
    return this.following ? this.following.inputs : this.inputs;
  }

  /** The drivers a person holds for this run. Following: the session's. Otherwise the session's plus this phone's. */
  private humanDrivers(): Set<DriverId> {
    const humans = new Set<DriverId>(this.sessionHeld);
    if (!this.following && this.held !== null) humans.add(this.held);
    return humans;
  }

  private ensureRun(): RunOutput {
    if (!this.run) {
      const humans = this.following ? new Set<DriverId>(this.sessionHeld) : this.humanDrivers();
      this.run = runEvening(WX, this.evening, {
        policy: this.policy,
        params: this.params,
        inputs: this.activeInputs().map((i) => ({ atMinute: i.atMinute, input: i.input })),
        humanDrivers: humans.size === 0 ? undefined : humans,
      });
      this.runs += 1;
    }
    return this.run;
  }

  private publish(): void {
    this.revision += 1;
    this.snap = this.makeSnapshot();
    for (const l of this.listeners) l();
  }

  private makeSnapshot(): LiveSnapshot {
    return {
      revision: this.revision,
      eveningId: this.evening.id,
      split: this.evening.split,
      date: this.evening.date,
      policy: this.policy,
      minute: this.minute(),
      running: this.running,
      ended: this.ended(),
      secondsPerMinute: this.secondsPerMinute,
      inputCount: this.activeInputs().length,
    };
  }
}

/** Problem texts for the store's refusals. They are data (English), shown next to the request that failed. */
export const FOLLOWER_NO_LOCAL_INPUT = 'this phone follows a session: send a request instead';
export const FOLLOWER_DASHBOARD_ONLY = 'this change is made on the dashboard';

function sortBySeq(inputs: readonly SessionInput[]): SessionInput[] {
  return [...inputs].sort((a, b) => a.seq - b.seq);
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

function validSpeed(s: number): number {
  if (!Number.isFinite(s) || s <= 0) throw new RangeError(`seconds per minute must be > 0, got ${s}`);
  return s;
}

function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
