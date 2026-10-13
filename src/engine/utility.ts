import type { Lot, Pantry, UtilityBreakdown, UtilityWeights } from './types';

/**
 * The four parts of a pantry's value for a lot (guide page 11). Each raw score is in [0, 1]; the value
 * is their weighted sum. These raw-score formulas are PROPOSED engine definitions (docs/decisions.md,
 * "Scoring definitions"), to be confirmed before tuning freezes the weights.
 */
export interface ScoreInputs {
  pantry: Pantry;
  lot: Lot;
  needKg: number;
  remainingNeedKg: number;
  roadKm: number;
  maxRoadKm: number;
  /** Minutes from round-1 close to the earliest possible arrival at this pantry. */
  transportMinutes: number;
}

/** Freshness falls to zero after this many minutes on the road. */
export const FRESHNESS_HORIZON_MIN = 60;
/** A pantry with no fridge can still serve a fridge-if-kept lot tonight, so it scores low, not zero. */
export const NO_FRIDGE_STORAGE_SCORE = 0.2;

export function rawScores(x: ScoreInputs): Omit<UtilityBreakdown, 'total'> {
  const needsFridge = x.lot.items.some((i) => i.needsFridgeIfKept);
  return {
    need: x.needKg > 0 ? Math.max(0, Math.min(1, x.remainingNeedKg / x.needKg)) : 0,
    storage: needsFridge && !x.pantry.hasFridge ? NO_FRIDGE_STORAGE_SCORE : 1,
    distance: Math.max(0, 1 - x.roadKm / x.maxRoadKm),
    freshness: Math.max(0, 1 - x.transportMinutes / FRESHNESS_HORIZON_MIN),
  };
}

/** Weighted parts, so the breakdown reads like the guide's table (Bukal 0.35 + 0.25 + 0.12 + 0.10). */
export function utility(x: ScoreInputs, w: UtilityWeights): UtilityBreakdown {
  const r = rawScores(x);
  const need = w.need * r.need;
  const storage = w.storage * r.storage;
  const distance = w.distance * r.distance;
  const freshness = w.freshness * r.freshness;
  return { need, storage, distance, freshness, total: need + storage + distance + freshness };
}
