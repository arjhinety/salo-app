import { TRUE_SHOW_RATE } from './hiddenTruth.generated';
import { resultFromLog } from './metrics';
import { BID_WINDOW_MINUTES, LATE_SHARE_OF_SHOWS, WITHDRAW_SHARE_OF_MISSES } from './params';
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
 * Decision D-Q1 is provisional until it is measured on the tuning evenings: both rules are built.
 * 'earliest_eta': earliest on-time arrival wins, reliability breaks ties (the default).
 * 'most_reliable': most reliable on-time driver wins, earliest arrival breaks ties.
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
  replies: PantryCandidate[];
  bids: Map<PantryId, number>;
}

type QEvent =
  | { kind: 'post'; lot: Lot }
  | { kind: 'reply'; lotId: LotId; pantryId: PantryId }
  | { kind: 'close'; lotId: LotId }
  | { kind: 'driverRound'; lotId: LotId }
  | { kind: 'noShow'; lotId: LotId; token: number }
  | { kind: 'arrive'; lotId: LotId; token: number; lateMin: number }
  | { kind: 'input'; input: EngineInput };

interface Queued {
  minute: Minute;
  /** 0 = engine events, 1 = outside inputs: an input at minute m applies after the engine's own events of m. */
  phase: 0 | 1;
  seq: number;
  ev: QEvent;
}

/** Binary min-heap on (minute, phase, seq): same-minute engine events run in scheduling order, then inputs. */
class Queue {
  private h: Queued[] = [];
  private n = 0;
  push(minute: Minute, ev: QEvent) {
    const h = this.h;
    h.push({ minute, phase: ev.kind === 'input' ? 1 : 0, seq: this.n++, ev });
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
  const { world } = wx;
  const { params, policy: policyId } = opts;
  const driverRule = opts.driverRule ?? 'earliest_eta';
  const truth = opts.trueShowRate ?? TRUE_SHOW_RATE;
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
      attempts: 0, token: 0, replies: [], bids: new Map(),
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
    q.push(now, { kind: 'driverRound', lotId: ls.lot.id });
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
    const offers: { ds: DriverState; pickup: Minute; arrive: Minute; rel: number }[] = [];
    for (const ds of drivers) {
      if (ls.excluded.has(ds.d.id) || !canCarry(ds, lot)) continue;
      const { pickup, arrive } = trip(ds, lot, pantryId, now);
      const deadline = Math.min(ds.d.availableToMinute, lot.pickupByMinute, pantry.closesMinute);
      if (arrive > deadline) continue;
      const rel = reliability(ds.shows, ds.runs);
      offers.push({ ds, pickup, arrive, rel });
      msg({ type: 'PROPOSE', proposer: 'driver', lotId: lot.id, atMinute: now, driverId: ds.d.id,
        etaMinute: arrive, reliability: rel });
    }
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

    // Ground truth for this offer, from the counter-based RNG (same draws under every policy).
    const k = ls.attempts++;
    const pShow = truth[ds.d.id];
    if (pShow === undefined) throw new Error(`no true show rate for ${ds.d.id}`);
    const u = u01(seed, STREAM.driverOutcome, ds.idx, ls.idx, 2 * k);
    if (u >= pShow) {
      const withdraws = u01(seed, STREAM.driverOutcome, ds.idx, ls.idx, 2 * k + 1) < WITHDRAW_SHARE_OF_MISSES;
      if (withdraws) {
        msg({ type: 'FAILURE', lotId: lot.id, atMinute: now, driverId: ds.d.id, reason: 'withdrew_before_commit' });
        updateReliability(ds, false);
        ls.excluded.add(ds.d.id);
        q.push(now, { kind: 'driverRound', lotId: lot.id });
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

  function failCommitted(ls: LotState, reason: 'no_show' | 'cancelled_by_operator') {
    const ds = driverById.get(ls.driverId!)!;
    msg({ type: 'FAILURE', lotId: ls.lot.id, atMinute: now, driverId: ds.d.id, reason });
    updateReliability(ds, false);
    ds.freeAt = now;
    ls.token += 1;
    ls.excluded.add(ds.d.id);
    ls.driverId = null;
    // Only the delivery is re-announced; the pantry keeps its tentative award (guide page 14).
    setState(ls, 'tentative');
    q.push(now, { kind: 'driverRound', lotId: ls.lot.id });
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
    }
    // DRIVER_RESPONSE (human-held driver profiles, decision D-Q5) arrives with milestone M5.
  }

  for (let e = q.pop(); e; e = q.pop()) {
    now = e.minute;
    const ev = e.ev;
    if (ev.kind === 'post') post(ev.lot);
    else if (ev.kind === 'input') input(ev.input);
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
