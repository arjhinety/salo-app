import { UNTUNED_PARAMS, SHARE_BUDGET_PER_EVENING } from '../engine/params';
import { u01 } from '../engine/rng';
import type { FrozenParams, UtilityWeights } from '../engine/types';
import { TUNING_EVENING_IDS } from './objective';

/**
 * M6 tuning sampler (docs/decisions.md, "M6 tuning and pilot"). Pure TypeScript, no engine state.
 *
 * Every setting is drawn from the engine's counter-based RNG (`u01`), so a draw depends only on its keys:
 * the same seed and index always give the same setting, whatever order the settings are visited in.
 * Index 0 is the untuned starting setting (params.ts UNTUNED_PARAMS). Indices 1..budget are sampled.
 *
 * Equal effort (guide p.11): Salo and central greedy use the same weight stream, so setting k has the same four
 * utility weights under both policies. Only the knob differs: Salo's share-bid scale (whole numbers 5 to 40) or
 * central greedy's transport penalty per minute (uniform 0 to 0.02).
 */

/** Sampler seed (decision "M6 tuning and pilot"). */
export const TUNING_SEED = 20261101;
/** Evaluated settings per policy, sampled. Setting 0 (untuned) is evaluated in addition. */
export const TUNING_BUDGET = 400;

/** Stream ids for the tuning draws. They are separate from the engine's streams (1 to 5). */
export const TUNING_STREAM = { weights: 101, scale: 102, penalty: 103 } as const;

/** Salo's share-bid scale: whole numbers from SCALE_MIN to SCALE_MAX, both included. */
export const SCALE_MIN = 5;
export const SCALE_MAX = 40;
/** Central greedy's transport penalty per minute: uniform on [0, PENALTY_MAX). */
export const PENALTY_MAX = 0.02;

export type TunedPolicy = 'salo' | 'central_greedy';

export interface TunedSetting {
  /** 0 = the untuned starting setting; 1..budget = sampled. */
  index: number;
  weights: UtilityWeights;
  /** Salo: the share-bid scale (a whole number, 5 to 40). Central greedy: the penalty per minute, in [0, 0.02). */
  knob: number;
}

/**
 * Dirichlet(1, 1, 1, 1) on the simplex: four independent Exp(1) draws, normalised. Exp(1) is -ln(1 - u) for a
 * uniform u in [0, 1), so `1 - u` is never 0 and the logarithm is finite.
 */
export function dirichletWeights(seed: number, index: number): UtilityWeights {
  const g = [0, 1, 2, 3].map((j) => -Math.log(1 - u01(seed, TUNING_STREAM.weights, index, j)));
  const total = g.reduce((s, x) => s + x, 0);
  if (!(total > 0)) throw new Error(`degenerate weight draw at index ${index}`);
  return { need: g[0] / total, storage: g[1] / total, distance: g[2] / total, freshness: g[3] / total };
}

/** Salo's scale: uniform over the whole numbers SCALE_MIN..SCALE_MAX (36 values). */
export function saloScale(seed: number, index: number): number {
  const n = SCALE_MAX - SCALE_MIN + 1;
  return SCALE_MIN + Math.floor(u01(seed, TUNING_STREAM.scale, index, 0) * n);
}

/** Central greedy's penalty per minute: uniform on [0, PENALTY_MAX). */
export function centralPenalty(seed: number, index: number): number {
  return u01(seed, TUNING_STREAM.penalty, index, 0) * PENALTY_MAX;
}

/** The settings one policy evaluates: index 0 untuned, then `budget` sampled settings. */
export function sampleSettings(
  policy: TunedPolicy,
  budget: number = TUNING_BUDGET,
  seed: number = TUNING_SEED,
): TunedSetting[] {
  const untunedWeights = UNTUNED_PARAMS.salo.utilityWeights;
  const untunedKnob = policy === 'salo' ? UNTUNED_PARAMS.salo.shareBid.scale : UNTUNED_PARAMS.centralGreedy.transportPenaltyPerMinute;
  const out: TunedSetting[] = [{ index: 0, weights: untunedWeights, knob: untunedKnob }];
  for (let k = 1; k <= budget; k++) {
    const knob = policy === 'salo' ? saloScale(seed, k) : centralPenalty(seed, k);
    out.push({ index: k, weights: dirichletWeights(seed, k), knob });
  }
  return out;
}

/**
 * The FrozenParams a setting stands for. The policy not being tuned keeps its untuned values; the engine never
 * reads them for the other policy.
 */
export function paramsFor(policy: TunedPolicy, s: TunedSetting, frozenOn = 'M6 tuning (not frozen)'): FrozenParams {
  const tuningEvenings = [...TUNING_EVENING_IDS];
  if (policy === 'salo') {
    return {
      schema: 1,
      frozenOn,
      tuningEvenings,
      salo: { utilityWeights: s.weights, shareBudgetPerEvening: SHARE_BUDGET_PER_EVENING, shareBid: { kind: 'linear', scale: s.knob } },
      centralGreedy: UNTUNED_PARAMS.centralGreedy,
    };
  }
  return {
    schema: 1,
    frozenOn,
    tuningEvenings,
    salo: UNTUNED_PARAMS.salo,
    centralGreedy: { utilityWeights: s.weights, transportPenaltyPerMinute: s.knob },
  };
}
