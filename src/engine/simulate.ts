import { TRUE_SHOW_RATE } from './hiddenTruth.generated';
import { resultFromLog } from './metrics';
import {
  BID_WINDOW_MINUTES, DRIVER_REPLY_DELAY_MAX_MIN, HUMAN_REPLY_WINDOW_MIN, LATE_SHARE_OF_SHOWS,
  WITHDRAW_SHARE_OF_MISSES,
} from './params';
import { centralGreedyPolicy, fcfsPolicy, nearestPolicy, saloPolicy } from './policies';
import { reliability } from './reliability';
import { STREAM, intBelow, u01 } from './rng';
import { shareBid } from './shares';
import { utility } from './utility';
import type { WorldIndex } from './world';
import type {
  AgentMessage,
  AllocationPolicy,
  AwardState,
  Driver,
  DriverId,
  EngineEvent,
  EngineInput,
  Evening,
  EveningResult,
  FrozenParams,
  LogEntry,
  Lot,
  LotId,
  Minute,
  PantryCandidate,
  PantryId,
  PolicyId,
  UtilityWeights,
} from './types';

/**
 * Decision D-Q1 is FINAL: 'earliest_eta' (earliest on-time arrival wins, reliability breaks ties).
 * 'most_reliable' stays only for the recorded tuning-evening comparison; pilot and main runs use the default.
 */
export type DriverRule = 'earliest_eta' | 'most_reliable';

export interface RunOptions {
  policy: PolicyId;
  params: FrozenParams;
  /** Outside events with the minute they happen (live posts, Cancel driver). Replay = same inputs. */
  inputs?: readonly { atMinute: Minute; input: EngineInput }[];
  driverRule?: DriverRule;
  /**
   * Hidden ground truth: each driver's real show rate (decision "Hidden true show rate", T1). Only the
   * simulated world reads it; agents learn from tuning counts and never see it. Defaults to the
   * generator's recovered p_show.
   */
  trueShowRate?: Readonly<Record<DriverId, number>>;
  /**
   * Driver reply delay: the first driver round after TENTATIVE_ACCEPT, and every re-announcement after a
   * driver FAILURE, comes 1 to this many minutes later, seeded per lot and per round (decision "Driver
   * reply delay"). 0 means immediate (the pre-delay behaviour, re-announcements in the same minute).
   * Defaults to DRIVER_REPLY_DELAY_MAX_MIN.
   */
  replyDelayMaxMin?: number;
  /**
   * Driver profiles held by a person on the phone (decision D-Q5). They are asked like any driver but never
   * offer or commit on their own: they answer with DRIVER_RESPONSE inputs. Tuning evenings only (the guard in
   * runEvening). Absent or empty: every driver is simulated, as before D-Q5.
   */
  humanDrivers?: ReadonlySet<DriverId>;
}

export interface RunOutput {
  log: LogEntry[];
  result: EveningResult;
  /** How often the driver rule's choice differed from the other rule's (to settle D-Q1 on tuning evenings). */
  driverRuleStats: {
    rounds: number;
    /** Rounds where the two rules would pick different drivers. */
    decidedByReliability: number;
    /** Rounds where two or more drivers tie on the earliest ETA, so reliability breaks the tie (rule 'earliest_eta'). */
    etaTiesBrokenByReliability: number;
  };
}

type Loc = { at: 'home' } | { at: 'pantry'; pantryId: PantryId };

interface DriverState {
  d: Driver;
  idx: number;
  freeAt: Minute;
  loc: Loc;
  shows: number;
  runs: number;
}

interface LotState {
  lot: Lot;
  idx: number;
  state: AwardState;
  pantryId: PantryId | null;
  driverId: DriverId | null;
  excluded: Set<DriverId>;
  attempts: number;
  /** Bumped whenever a commit is cancelled, so its pending pickup/arrival events are ignored. */
  token: number;
  /** Number of re-announcements after a driver FAILURE so far (the r in the reply-delay draw). */
  reannouncements: number;
  replies: PantryCandidate[];
  bids: Map<PantryId, number>;
  /** The driver round waiting for held drivers to answer (decision D-Q5), or null. */
  round: PendingRound | null;
}

/** A driver offer that the round's selection can choose (decision D-Q1). */
interface Offer {
  ds: DriverState;
  pickup: Minute;
  arrive: Minute;
  rel: number;
}

/** A driver round that waits for the held drivers in it (decision D-Q5). */
interface PendingRound {
  /** Held drivers asked in this round who have not answered yet. */
  waiting: Set<DriverId>;
  /** Simulated offers from the round's minute, and held offers as they come in. */
  offers: Offer[];
}

/** A held driver the engine picked, who must send COMMIT within the window (decision D-Q5). */
interface Awaiting {
  lotId: LotId;
  ds: DriverState;
  /** The ETA the engine computed at the selection, which the COMMIT carries. */
  etaMinute: Minute;
}

type QEvent =
  | { kind: 'post'; lot: Lot }
  | { kind: 'reply'; lotId: LotId; pantryId: PantryId }
  | { kind: 'close'; lotId: LotId }
  | { kind: 'driverRound'; lotId: LotId }
  | { kind: 'noShow'; lotId: LotId; token: number }
  | { kind: 'arrive'; lotId: LotId; token: number; lateMin: number }
  | { kind: 'input'; input: EngineInput }
  /** A held round's window ends (decision D-Q5). */
  | { kind: 'roundClose'; lotId: LotId; round: PendingRound }
  /** A picked held driver's COMMIT window ends (decision D-Q5). */
  | { kind: 'commitDeadline'; lotId: LotId; awaiting: Awaiting };

interface Queued {
  minute: Minute;
  /**
   * 0 = engine events, 1 = outside inputs: an input at minute m applies after the engine's own events of m.
   * 2 = window ends: they run after the inputs of their minute, so an answer in the last minute still counts.
   */
  phase: 0 | 1 | 2;
  seq: number;
  ev: QEvent;
}

/** Binary min-heap on (minute, phase, seq): same-minute engine events run in scheduling order, then inputs. */
class Queue {
  private h: Queued[] = [];
  private n = 0;
  push(minute: Minute, ev: QEvent) {
    const h = this.h;
    const phase = ev.kind === 'input' ? 1 : ev.kind === 'roundClose' || ev.kind === 'commitDeadline' ? 2 : 0;
    h.push({ minute, phase, seq: this.n++, ev });
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (less(h[p], h[i])) break;
      [h[p], h[i]] = [h[i], h[p]];
      i = p;
    }
  }
  pop(): Queued | undefined {
    const h = this.h;
    if (!h.length) return undefined;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && less(h[l], h[m])) m = l;
        if (r < h.length && less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
    }
    return top;
  }
}
const less = (a: Queued, b: Queued) =>
  a.minute < b.minute ||
  (a.minute === b.minute && (a.phase < b.phase || (a.phase === b.phase && a.seq < b.seq)));

function lotIndex(id: LotId): number {
  const m = /^L(\d+)$/.exec(id);
  if (m) return Number(m[1]);
  const live = /^LIVE-(\d+)$/.exec(id);
  if (live) return 100000 + Number(live[1]);
  throw new Error(`unexpected lot id ${id}`);
}

/** Runs one evening under one policy. Pure and deterministic: same inputs, same log. */
export function runEvening(wx: WorldIndex, evening: Evening, opts: RunOptions): RunOutput {
  // Decision D-Q5: people hold driver profiles only in the tuning evenings of the live demo. Evaluation never does.
  if (opts.humanDrivers?.size && evening.split !== 'tuning') {
    throw new Error(`held driver profiles are only allowed on tuning evenings; ${evening.id} is ${evening.split}`);
  }
  const { world } = wx;
  const { params, policy: policyId } = opts;
  const driverRule = opts.driverRule ?? 'earliest_eta';
  const truth = opts.trueShowRate ?? TRUE_SHOW_RATE;
  const replyDelayMax = opts.replyDelayMaxMin ?? DRIVER_REPLY_DELAY_MAX_MIN;
  const humans: ReadonlySet<DriverId> = opts.humanDrivers ?? new Set();
  /** Held drivers the engine picked and waits on for COMMIT (decision D-Q5). Keyed by driver. */
  const awaiting = new Map<DriverId, Awaiting>();
  const seed = evening.seed;
  const weights: UtilityWeights =
    policyId === 'central_greedy' ? params.centralGreedy.utilityWeights : params.salo.utilityWeights;

  const log: LogEntry[] = [];
  let now: Minute = 16 * 60;
  const emit = (event: EngineEvent) =>
    log.push({ seq: log.length + 1, evening: evening.id, policy: policyId, atMinute: now, event });
  const msg = (message: AgentMessage) => emit({ type: 'MESSAGE', message });
  const setState = (ls: LotState, state: AwardState) => {
    ls.state = state;
    emit({ type: 'AWARD_STATE', lotId: ls.lot.id, state });
  };

  const needKg = new Map(evening.needs.map((n) => [n.pantryId, n.isOpen ? n.needKg : 0]));
  const isOpen = new Map(evening.needs.map((n) => [n.pantryId, n.isOpen]));
  const remaining = new Map(needKg);
  const sharesLeft = new Map(world.pantries.map((p) => [p.id, params.salo.shareBudgetPerEvening]));
  const drivers: DriverState[] = world.drivers.map((d, idx) => ({
    d, idx, freeAt: 0, loc: { at: 'home' }, shows: d.tuningShows, runs: d.tuningRuns,
  }));
  const driverById = new Map(drivers.map((s) => [s.d.id, s]));
  const pantryById = new Map(world.pantries.map((p) => [p.id, p]));
  const lots = new Map<LotId, LotState>();
  const stats = { rounds: 0, decidedByReliability: 0, etaTiesBrokenByReliability: 0 };

  const bidOf = (c: PantryCandidate) =>
    policyId === 'salo' ? shareBid(c.utility.total, params.salo.shareBid.scale, sharesLeft.get(c.pantryId) ?? 0) : 0;
  const policy: AllocationPolicy =
    policyId === 'salo' ? saloPolicy(bidOf)
    : policyId === 'fcfs' ? fcfsPolicy
    : policyId === 'nearest' ? nearestPolicy
    : centralGreedyPolicy((c) => c.utility.total, params.centralGreedy.transportPenaltyPerMinute);

  /**
   * Minutes until a driver round (decision "Driver reply delay"): 0 when the reply delay is off. `r` is 0 for
   * the first round after TENTATIVE_ACCEPT and n for the n-th re-announcement after a FAILURE. The draw depends
   * only on (evening seed, lot, r), so it is the same under all four policies.
   */
  const roundDelay = (ls: LotState, r: number): number =>
    replyDelayMax > 0 ? 1 + intBelow(replyDelayMax, seed, STREAM.driverReply, r, ls.idx) : 0;

  /** Earliest arrival of `ds` at `pantryId` for a lot, starting no earlier than `from`. */
  function trip(ds: DriverState, lot: Lot, pantryId: PantryId, from: Minute) {
    const start = Math.max(from, ds.d.availableFromMinute, ds.freeAt);
    const toDonor =
      ds.loc.at === 'home'
        ? wx.homeToDonor(ds.d.id, lot.donorId)
        : wx.pantryToDonor(ds.loc.pantryId, lot.donorId, ds.d.vehicle);
    const pickup = start + Math.ceil(toDonor);
    const arrive = Math.ceil(start + toDonor + wx.road(lot.donorId, pantryId).minutes[ds.d.vehicle]);
    return { pickup, arrive };
  }
  const canCarry = (ds: DriverState, lot: Lot) => ds.d.capacityLoadUnits >= lot.loadUnits;

  function earliestArrival(lot: Lot, pantryId: PantryId, from: Minute): Minute | null {
    let best: Minute | null = null;
    for (const ds of drivers) {
      if (!canCarry(ds, lot)) continue;
      const { arrive } = trip(ds, lot, pantryId, from);
      if (arrive > ds.d.availableToMinute) continue;
      if (best === null || arrive < best) best = arrive;
    }
    return best;
  }

  const q = new Queue();
  for (const lot of evening.lots) q.push(lot.postedMinute, { kind: 'post', lot });
  for (const i of opts.inputs ?? []) q.push(i.atMinute, { kind: 'input', input: i.input });

  function post(lot: Lot) {
    const ls: LotState = {
      lot, idx: lotIndex(lot.id), state: 'announced', pantryId: null, driverId: null, excluded: new Set(),
      attempts: 0, token: 0, reannouncements: 0, replies: [], bids: new Map(), round: null,
    };
    lots.set(lot.id, ls);
    msg({ type: 'CALL_FOR_PROPOSALS', lotId: lot.id, atMinute: now, target: 'pantry', from: lot.donorId });
    setState(ls, 'announced');
    for (const p of world.pantries) {
      const k = wx.pantryIndex.get(p.id)!;
      const reply = now + intBelow(BID_WINDOW_MINUTES + 1, seed, STREAM.pantryReply, k, ls.idx);
      q.push(reply, { kind: 'reply', lotId: lot.id, pantryId: p.id });
    }
    q.push(now + BID_WINDOW_MINUTES, { kind: 'close', lotId: lot.id });
  }

  function reply(ls: LotState, pantryId: PantryId) {
    const p = pantryById.get(pantryId)!;
    const lot = ls.lot;
    const close = lot.postedMinute + BID_WINDOW_MINUTES;
    const earliest = earliestArrival(lot, pantryId, close);
    const leg = wx.road(lot.donorId, pantryId);
    const need = needKg.get(pantryId) ?? 0;
    const rem = remaining.get(pantryId) ?? 0;
    const refuse =
      !isOpen.get(pantryId) || earliest === null || earliest > p.closesMinute ? 'closed_before_earliest_arrival'
      : lot.estKg > p.dryStorageKg + p.fridgeCapacityKg ? 'cannot_store_lot'
      : rem <= 0 ? 'no_remaining_need'
      : null;
    const transportMinutes = earliest === null ? null : earliest - close;
    const u = utility(
      { pantry: p, lot, needKg: need, remainingNeedKg: rem, roadKm: leg.roadKm, maxRoadKm: wx.maxRoadKm,
        transportMinutes: transportMinutes ?? 1e9 },
      weights,
    );
    const cand: PantryCandidate = {
      pantryId, eligible: refuse === null, refuseReason: refuse, utility: u, roadKm: leg.roadKm,
      transportMinutes, replyMinute: now,
    };
    ls.replies.push(cand);
    if (refuse) {
      msg({ type: 'REFUSE', lotId: lot.id, atMinute: now, pantryId, reason: refuse });
    } else {
      const shares = bidOf(cand);
      ls.bids.set(pantryId, shares);
      msg({ type: 'PROPOSE', proposer: 'pantry', lotId: lot.id, atMinute: now, pantryId, shares, utility: u });
    }
  }

  function close(ls: LotState) {
    const choice = policy.choosePantry({
      atMinute: now, lot: ls.lot, candidates: ls.replies,
      remainingShares: policyId === 'salo' ? sharesLeft : new Map(),
    });
    if (!choice) {
      setState(ls, 'unawarded');
      return;
    }
    // D-Q4: only the winning bid spends shares; the bid is the one the pantry sent in its PROPOSE.
    const shares = ls.bids.get(choice.pantryId) ?? 0;
    if (policyId === 'salo') sharesLeft.set(choice.pantryId, (sharesLeft.get(choice.pantryId) ?? 0) - shares);
    remaining.set(choice.pantryId, (remaining.get(choice.pantryId) ?? 0) - ls.lot.estKg);
    ls.pantryId = choice.pantryId;
    msg({ type: 'TENTATIVE_ACCEPT', lotId: ls.lot.id, atMinute: now, donorId: ls.lot.donorId,
      pantryId: choice.pantryId, shares });
    setState(ls, 'tentative');
    // The first driver round waits 1..replyDelayMax minutes (a seeded draw per lot, same under all
    // policies), so the lot is visibly TENTATIVE. With 0 the round is in this same minute.
    q.push(now + roundDelay(ls, 0), { kind: 'driverRound', lotId: ls.lot.id });
  }

  function updateReliability(ds: DriverState, showed: boolean) {
    ds.runs += 1;
    if (showed) ds.shows += 1;
    emit({ type: 'RELIABILITY_UPDATED', driverId: ds.d.id, shows: ds.shows, runs: ds.runs,
      estimate: reliability(ds.shows, ds.runs) });
  }

  function strand(ls: LotState) {
    // Food that will never arrive no longer counts against the pantry's remaining need.
    if (ls.pantryId) remaining.set(ls.pantryId, (remaining.get(ls.pantryId) ?? 0) + ls.lot.estKg);
    setState(ls, 'stranded');
  }

  function driverRound(ls: LotState) {
    const lot = ls.lot;
    const pantryId = ls.pantryId!;
    const pantry = pantryById.get(pantryId)!;
    msg({ type: 'CALL_FOR_PROPOSALS', lotId: lot.id, atMinute: now, target: 'driver', from: lot.donorId });
    const offers: Offer[] = [];
    const waiting = new Set<DriverId>();
    for (const ds of drivers) {
      if (ls.excluded.has(ds.d.id) || awaiting.has(ds.d.id) || !canCarry(ds, lot)) continue;
      const { pickup, arrive } = trip(ds, lot, pantryId, now);
      const deadline = Math.min(ds.d.availableToMinute, lot.pickupByMinute, pantry.closesMinute);
      if (arrive > deadline) continue;
      // A held driver is asked but does not offer until the person answers (decision D-Q5).
      if (humans.has(ds.d.id)) {
        waiting.add(ds.d.id);
        continue;
      }
      const rel = reliability(ds.shows, ds.runs);
      offers.push({ ds, pickup, arrive, rel });
      msg({ type: 'PROPOSE', proposer: 'driver', lotId: lot.id, atMinute: now, driverId: ds.d.id,
        etaMinute: arrive, reliability: rel });
    }
    if (waiting.size) {
      // The selection waits for the held drivers: it happens when they have all answered, or at the window's end.
      const round: PendingRound = { waiting, offers };
      ls.round = round;
      q.push(now + HUMAN_REPLY_WINDOW_MIN, { kind: 'roundClose', lotId: lot.id, round });
      return;
    }
    decide(ls, offers);
  }

  /** The round's selection at `now`: earliest ETA, reliability breaks ties (decision D-Q1). */
  function decide(ls: LotState, offers: readonly Offer[]) {
    const lot = ls.lot;
    const pantryId = ls.pantryId!;
    if (!offers.length) {
      strand(ls);
      return;
    }
    const byEta = (a: (typeof offers)[0], b: (typeof offers)[0]) =>
      a.arrive - b.arrive || b.rel - a.rel || (a.ds.d.id < b.ds.d.id ? -1 : 1);
    const byRel = (a: (typeof offers)[0], b: (typeof offers)[0]) =>
      b.rel - a.rel || a.arrive - b.arrive || (a.ds.d.id < b.ds.d.id ? -1 : 1);
    const etaPick = [...offers].sort(byEta)[0];
    const relPick = [...offers].sort(byRel)[0];
    stats.rounds += 1;
    if (etaPick.ds !== relPick.ds) stats.decidedByReliability += 1;
    if (offers.filter((o) => o.arrive === etaPick.arrive).length > 1) stats.etaTiesBrokenByReliability += 1;
    const chosen = driverRule === 'earliest_eta' ? etaPick : relPick;
    const ds = chosen.ds;
    // A held driver's outcome is the person's answer, not a draw: no random number is used (decision D-Q5).
    if (humans.has(ds.d.id)) {
      pickHeld(ls, chosen);
      return;
    }

    // Ground truth for this offer, from the counter-based RNG (same draws under every policy).
    const k = ls.attempts++;
    const pShow = truth[ds.d.id];
    if (pShow === undefined) throw new Error(`no true show rate for ${ds.d.id}`);
    const u = u01(seed, STREAM.driverOutcome, ds.idx, ls.idx, 2 * k);
    if (u >= pShow) {
      const withdraws = u01(seed, STREAM.driverOutcome, ds.idx, ls.idx, 2 * k + 1) < WITHDRAW_SHARE_OF_MISSES;
      if (withdraws) {
        failBeforeCommit(ls, ds, 'withdrew_before_commit');
        return;
      }
    }
    msg({ type: 'COMMIT', lotId: lot.id, atMinute: now, driverId: ds.d.id, pantryId, etaMinute: chosen.arrive });
    ls.driverId = ds.d.id;
    setState(ls, 'final');
    if (u >= pShow) {
      ds.freeAt = chosen.pickup;
      q.push(chosen.pickup, { kind: 'noShow', lotId: lot.id, token: ls.token });
      return;
    }
    let lateMin = 0;
    if (u01(seed, STREAM.lateMinutes, ds.idx, ls.idx, 2 * k) < LATE_SHARE_OF_SHOWS && world.lateMinutes.length) {
      lateMin = world.lateMinutes[intBelow(world.lateMinutes.length, seed, STREAM.lateMinutes, ds.idx, ls.idx, 2 * k + 1)];
    }
    ds.freeAt = chosen.arrive + lateMin;
    q.push(chosen.arrive + lateMin, { kind: 'arrive', lotId: lot.id, token: ls.token, lateMin });
  }

  /** A driver FAILURE before COMMIT: the driver is excluded for this lot, and the lot is re-announced after the reply delay. */
  function failBeforeCommit(ls: LotState, ds: DriverState, reason: 'withdrew_before_commit' | 'no_reply') {
    msg({ type: 'FAILURE', lotId: ls.lot.id, atMinute: now, driverId: ds.d.id, reason });
    updateReliability(ds, false);
    ls.excluded.add(ds.d.id);
    // Re-announced after the reply delay, like the first round after TENTATIVE_ACCEPT.
    ls.reannouncements += 1;
    q.push(now + roundDelay(ls, ls.reannouncements), { kind: 'driverRound', lotId: ls.lot.id });
  }

  /** Decision D-Q5: a held driver is picked. The lot stays TENTATIVE until the person sends COMMIT, or the window ends. */
  function pickHeld(ls: LotState, chosen: Offer) {
    const aw: Awaiting = { lotId: ls.lot.id, ds: chosen.ds, etaMinute: chosen.arrive };
    awaiting.set(chosen.ds.d.id, aw);
    q.push(now + HUMAN_REPLY_WINDOW_MIN, { kind: 'commitDeadline', lotId: ls.lot.id, awaiting: aw });
  }

  /**
   * The round's offers checked again at `now`, the selection minute. Held rounds can wait a few minutes, and a driver
   * may have been picked for another lot meanwhile, so offers that no longer arrive in time are dropped (decision D-Q5).
   */
  function stillOffered(ls: LotState, offers: readonly Offer[]): Offer[] {
    const lot = ls.lot;
    const pantry = pantryById.get(ls.pantryId!)!;
    const kept: Offer[] = [];
    for (const o of offers) {
      if (awaiting.has(o.ds.d.id)) continue;
      const { pickup, arrive } = trip(o.ds, lot, ls.pantryId!, now);
      const deadline = Math.min(o.ds.d.availableToMinute, lot.pickupByMinute, pantry.closesMinute);
      if (arrive <= deadline) kept.push({ ...o, pickup, arrive });
    }
    return kept;
  }

  function finishRound(ls: LotState, round: PendingRound) {
    ls.round = null;
    decide(ls, stillOffered(ls, round.offers));
  }

  /** The held round's window ends: a held driver who has not answered counts as a decline (decision D-Q5). */
  function closeRound(ls: LotState, round: PendingRound) {
    if (ls.round !== round) return; // every held driver answered earlier
    for (const id of round.waiting) ls.excluded.add(id);
    round.waiting.clear();
    finishRound(ls, round);
  }

  /** A DRIVER_RESPONSE from the person holding a driver profile (decision D-Q5). Answers that do not apply are ignored. */
  function answer(i: Extract<EngineInput, { type: 'DRIVER_RESPONSE' }>) {
    const ls = lots.get(i.lotId);
    if (!ls) return;
    const aw = awaiting.get(i.driverId);
    if (aw && aw.lotId === i.lotId) {
      if (i.answer === 'commit') commitHeld(ls, aw);
      else if (i.answer === 'withdraw') withdrawHeld(ls, aw);
      return;
    }
    const round = ls.round;
    if (!round || !round.waiting.has(i.driverId)) return;
    if (i.answer === 'offer') offerHeld(ls, round, i.driverId);
    else if (i.answer === 'decline') {
      round.waiting.delete(i.driverId);
      ls.excluded.add(i.driverId);
      if (round.waiting.size === 0) finishRound(ls, round);
    }
  }

  /** A held driver offers. The ETA is computed now, from the driver's state now. Not eligible any more: ignored. */
  function offerHeld(ls: LotState, round: PendingRound, driverId: DriverId) {
    const ds = driverById.get(driverId)!;
    const lot = ls.lot;
    const pantry = pantryById.get(ls.pantryId!)!;
    const { pickup, arrive } = trip(ds, lot, ls.pantryId!, now);
    const deadline = Math.min(ds.d.availableToMinute, lot.pickupByMinute, pantry.closesMinute);
    if (awaiting.has(driverId) || arrive > deadline) return;
    round.waiting.delete(driverId);
    const rel = reliability(ds.shows, ds.runs);
    round.offers.push({ ds, pickup, arrive, rel });
    msg({ type: 'PROPOSE', proposer: 'driver', lotId: lot.id, atMinute: now, driverId, etaMinute: arrive, reliability: rel });
    if (round.waiting.size === 0) finishRound(ls, round);
  }

  /** A picked held driver sends COMMIT. No lateness draw and no no-show for a held driver (decision D-Q5). */
  function commitHeld(ls: LotState, aw: Awaiting) {
    awaiting.delete(aw.ds.d.id);
    msg({ type: 'COMMIT', lotId: ls.lot.id, atMinute: now, driverId: aw.ds.d.id, pantryId: ls.pantryId!, etaMinute: aw.etaMinute });
    ls.driverId = aw.ds.d.id;
    setState(ls, 'final');
    // Arrives at the ETA. A commit later than the ETA arrives at the commit minute instead, so nothing is delivered before it is final.
    const arriveAt = Math.max(aw.etaMinute, now);
    aw.ds.freeAt = arriveAt;
    q.push(arriveAt, { kind: 'arrive', lotId: ls.lot.id, token: ls.token, lateMin: 0 });
  }

  /** A picked held driver withdraws before COMMIT: a missed run, like any withdrawal (DRV-04). */
  function withdrawHeld(ls: LotState, aw: Awaiting) {
    awaiting.delete(aw.ds.d.id);
    failBeforeCommit(ls, aw.ds, 'withdrew_before_commit');
  }

  /** The COMMIT window of a picked held driver ends. Acts only if that pick is still waiting (decision D-Q5). */
  function missedCommit(aw: Awaiting) {
    if (awaiting.get(aw.ds.d.id) !== aw) return;
    awaiting.delete(aw.ds.d.id);
    failBeforeCommit(lots.get(aw.lotId)!, aw.ds, 'no_reply');
  }

  function failCommitted(ls: LotState, reason: 'no_show' | 'cancelled_by_operator') {
    const ds = driverById.get(ls.driverId!)!;
    msg({ type: 'FAILURE', lotId: ls.lot.id, atMinute: now, driverId: ds.d.id, reason });
    updateReliability(ds, false);
    ds.freeAt = now;
    ls.token += 1;
    ls.excluded.add(ds.d.id);
    ls.driverId = null;
    // Only the delivery is re-announced; the pantry keeps its tentative award (guide page 14).
    // Re-announced after the reply delay. The lot stays 'tentative' while the round is pending, so a
    // further CANCEL_DRIVER in that window is ignored (it only acts on 'final').
    setState(ls, 'tentative');
    ls.reannouncements += 1;
    q.push(now + roundDelay(ls, ls.reannouncements), { kind: 'driverRound', lotId: ls.lot.id });
  }

  function arrive(ls: LotState, lateMin: number) {
    const ds = driverById.get(ls.driverId!)!;
    const onTime = now <= ls.lot.pickupByMinute;
    emit({ type: 'DELIVERY', lotId: ls.lot.id, pantryId: ls.pantryId!, driverId: ds.d.id, kg: ls.lot.estKg,
      onTime, minutesLate: lateMin });
    updateReliability(ds, true);
    ds.loc = { at: 'pantry', pantryId: ls.pantryId! };
    setState(ls, 'delivered');
  }

  function input(i: EngineInput) {
    emit({ type: 'INPUT', input: i });
    if (i.type === 'LOT_POSTED') post(i.lot);
    else if (i.type === 'CANCEL_DRIVER') {
      const ls = lots.get(i.lotId);
      if (ls && ls.state === 'final' && ls.driverId) failCommitted(ls, 'cancelled_by_operator');
    } else if (i.type === 'DRIVER_RESPONSE') answer(i);
  }

  for (let e = q.pop(); e; e = q.pop()) {
    now = e.minute;
    const ev = e.ev;
    if (ev.kind === 'post') post(ev.lot);
    else if (ev.kind === 'input') input(ev.input);
    else if (ev.kind === 'roundClose') closeRound(lots.get(ev.lotId)!, ev.round);
    else if (ev.kind === 'commitDeadline') missedCommit(ev.awaiting);
    else {
      const ls = lots.get(ev.lotId)!;
      if (ev.kind === 'reply') reply(ls, ev.pantryId);
      else if (ev.kind === 'close') close(ls);
      else if (ev.kind === 'driverRound') {
        if (ls.state === 'tentative') driverRound(ls);
      } else if (ev.token === ls.token && ls.state === 'final') {
        if (ev.kind === 'noShow') failCommitted(ls, 'no_show');
        else arrive(ls, ev.lateMin);
      }
    }
  }

  const postedKg = [...lots.values()].reduce((s, l) => s + l.lot.estKg, 0);
  return {
    log,
    result: resultFromLog(log, evening.needs, postedKg, evening.id, policyId, evening.split),
    driverRuleStats: stats,
  };
}
