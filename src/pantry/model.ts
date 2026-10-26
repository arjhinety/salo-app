/**
 * The pantry coordinator's view of one evening, folded from the engine's visible event log (decision D-04).
 * Pure TypeScript: no React, no Expo. Every number comes from the log: the four value parts are the engine's
 * UtilityBreakdown on the pantry's PROPOSE, the shares are the bid and the TENTATIVE_ACCEPT, and a refusal is the
 * engine's REFUSE. Nothing is re-derived here.
 */
import { SHARE_BUDGET_PER_EVENING } from '../engine/params';
import type { LogEntry, Lot, LotId, Minute, PantryId, RefuseReason, UtilityBreakdown } from '../engine/types';

export type PartKey = 'need' | 'storage' | 'distance' | 'freshness';

/** The four parts and their total, to two decimals. The total is the sum of the rounded parts, so it always adds up. */
export interface ValueParts {
  need: number;
  storage: number;
  distance: number;
  freshness: number;
  total: number;
}

/** Builds display parts from the engine's breakdown. Integer cents avoid float drift in the sum. */
export function valueFromParts(p: Record<PartKey, number>): ValueParts {
  const c = (x: number) => Math.round(x * 100);
  const need = c(p.need);
  const storage = c(p.storage);
  const distance = c(p.distance);
  const freshness = c(p.freshness);
  return {
    need: need / 100,
    storage: storage / 100,
    distance: distance / 100,
    freshness: freshness / 100,
    total: (need + storage + distance + freshness) / 100,
  };
}

export function valueParts(u: UtilityBreakdown): ValueParts {
  return valueFromParts({ need: u.need, storage: u.storage, distance: u.distance, freshness: u.freshness });
}

/**
 * Where this pantry stands on one lot at the clock.
 * - bidding: the pantry has not been refused and the lot is still in its bid round.
 * - outbid: another pantry got the lot tentatively.
 * - tentative / final / delivered / stranded: this pantry got the lot (TENTATIVE_ACCEPT names it).
 * - refused: the engine's REFUSE for this pantry; no value is shown.
 */
export type PantryStatus = 'bidding' | 'refused' | 'outbid' | 'tentative' | 'final' | 'delivered' | 'stranded';

export interface PantryLotView {
  lot: Lot;
  status: PantryStatus;
  /** True while the clock has not passed the lot's pickup-by minute (PAN-01). */
  open: boolean;
  /** True when a TENTATIVE_ACCEPT names this pantry. Awards are listed apart from open lots. */
  awarded: boolean;
  refuseReason: RefuseReason | null;
  /** The engine's bid for this pantry, or null if there is no PROPOSE yet (or the pantry refused). */
  bid: { shares: number; value: ValueParts; engineTotal: number } | null;
  /** Shares this pantry spent on the lot (TENTATIVE_ACCEPT), or null if it did not win. */
  awardShares: number | null;
  /** A driver failed after this pantry's award; the delivery was re-announced (PAN-06). */
  reannounced: boolean;
  roadKm: number;
}

export interface PantryLotInput {
  /** Every lot posted by the clock, in posting order (dataset and live). */
  lots: readonly Lot[];
  /** The engine log. Entries after `clock` are ignored, so the caller may pass the whole log. */
  log: readonly LogEntry[];
  pantryId: PantryId;
  clock: Minute;
  /** Road distance in km from a donor to a pantry (the world data). */
  roadKm: (donorId: string, pantryId: PantryId) => number;
}

interface Fold {
  state: string | undefined;
  refuse: RefuseReason | null;
  bid: { shares: number; utility: UtilityBreakdown } | null;
  closed: boolean;
  winner: PantryId | null;
  winnerShares: number | null;
  reannounced: boolean;
}

/** Every lot this pantry can see at the clock, with its status. Open and awarded lots are split by the caller. */
export function pantryLotViews(input: PantryLotInput): PantryLotView[] {
  const { lots, log, pantryId, clock } = input;
  const folds = new Map<LotId, Fold>();
  const fold = (id: LotId): Fold => {
    let f = folds.get(id);
    if (!f) {
      f = { state: undefined, refuse: null, bid: null, closed: false, winner: null, winnerShares: null, reannounced: false };
      folds.set(id, f);
    }
    return f;
  };
  for (const entry of log) {
    if (entry.atMinute > clock) continue;
    const ev = entry.event;
    if (ev.type === 'AWARD_STATE') {
      fold(ev.lotId).state = ev.state;
    } else if (ev.type === 'MESSAGE') {
      const m = ev.message;
      const f = fold(m.lotId);
      if (m.type === 'PROPOSE' && m.proposer === 'pantry' && m.pantryId === pantryId) {
        f.bid = { shares: m.shares, utility: m.utility };
      } else if (m.type === 'REFUSE' && m.pantryId === pantryId) {
        f.refuse = m.reason;
      } else if (m.type === 'TENTATIVE_ACCEPT') {
        f.closed = true;
        f.winner = m.pantryId;
        f.winnerShares = m.shares;
      } else if (m.type === 'FAILURE' && f.winner === pantryId) {
        f.reannounced = true;
      }
    }
  }

  return lots.map((lot) => {
    const f = folds.get(lot.id) ?? fold(lot.id);
    const awarded = f.winner === pantryId;
    let status: PantryStatus;
    if (f.refuse) status = 'refused';
    else if (awarded) status = awardedStatus(f.state);
    else if (f.closed) status = 'outbid';
    else status = 'bidding';
    return {
      lot,
      status,
      open: clock <= lot.pickupByMinute,
      awarded,
      refuseReason: f.refuse,
      bid: f.bid ? { shares: f.bid.shares, value: valueParts(f.bid.utility), engineTotal: f.bid.utility.total } : null,
      awardShares: awarded ? f.winnerShares : null,
      reannounced: awarded && f.reannounced,
      roadKm: input.roadKm(lot.donorId, pantryId),
    };
  });
}

function awardedStatus(state: string | undefined): PantryStatus {
  if (state === 'final') return 'final';
  if (state === 'delivered') return 'delivered';
  if (state === 'stranded') return 'stranded';
  return 'tentative';
}

/** Shares this pantry has left at the clock: the budget minus what its winning bids spent (D-Q4). */
export function sharesLeft(log: readonly LogEntry[], pantryId: PantryId, clock: Minute, budget = SHARE_BUDGET_PER_EVENING): number {
  let spent = 0;
  for (const entry of log) {
    if (entry.atMinute > clock || entry.event.type !== 'MESSAGE') continue;
    const m = entry.event.message;
    if (m.type === 'TENTATIVE_ACCEPT' && m.pantryId === pantryId) spent += m.shares;
  }
  return budget - spent;
}

/** Open lots are posted and not past their pickup-by minute, and not awarded to this pantry (PAN-01). */
export function openLots(views: readonly PantryLotView[]): PantryLotView[] {
  return views.filter((v) => v.open && !v.awarded);
}

/** The lots this pantry was tentatively given, whatever their deadline (PAN-05, PAN-06). */
export function myAwards(views: readonly PantryLotView[]): PantryLotView[] {
  return views.filter((v) => v.awarded);
}
