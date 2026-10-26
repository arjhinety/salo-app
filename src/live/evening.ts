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
    if (this.running || this.ended()) return;
    this.running = true;
    this.lastTickMs = nowMs;
    this.publish();
  }

  pause(nowMs: number = Date.now()): void {
    if (!this.running) return;
    this.advanceTo(nowMs);
    this.running = false;
    this.lastTickMs = null;
    this.publish();
  }

  /** Real seconds per simulated minute. Time already elapsed is counted at the old speed. */
  setSpeed(secondsPerMinute: number, nowMs: number = Date.now()): void {
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
    return Array.from({ length: Math.max(0, count) }, (_, i) => `LIVE-${this.liveCount + 1 + i}`);
  }

  /** Cancel the driver of a lot. Only allowed while that lot is FINAL at the clock (decision D-Q7). */
  cancelDriver(lotId: LotId): LiveResult<LotId> {
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
    this.inputs.push({ atMinute: this.minute(), input: { type: 'DRIVER_RESPONSE', driverId, lotId, answer } });
    this.run = null;
    this.publish();
  }

  /** Switches the policy at the clock, keeping the clock where it is. */
  setPolicy(policy: PolicyId): void {
    if (policy === this.policy) return;
    this.policy = policy;
    this.run = null;
    this.publish();
  }

  /**
   * "Replay with baseline": the same input log under another policy, from 17:00 and paused, so the panel sees
   * the same evening again from the start. Inputs keep their minutes and appear again as the clock reaches them.
   */
  replayUnder(policy: PolicyId): void {
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
    return this.inputs.filter((i) => i.atMinute <= minute);
  }

  /** Every input so far, in order. Replaying these with the seed and world reproduces the evening (D-06). */
  inputLog(): readonly TimedInput[] {
    return this.inputs;
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

  private ensureRun(): RunOutput {
    if (!this.run) {
      this.run = runEvening(WX, this.evening, {
        policy: this.policy,
        params: this.params,
        inputs: this.inputs.map((i) => ({ atMinute: i.atMinute, input: i.input })),
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
      inputCount: this.inputs.length,
    };
  }
}

function validSpeed(s: number): number {
  if (!Number.isFinite(s) || s <= 0) throw new RangeError(`seconds per minute must be > 0, got ${s}`);
  return s;
}

function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
