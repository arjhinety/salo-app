import { runEvening } from '../engine/simulate';
import type { Evening, EveningResult, FrozenParams, PolicyId } from '../engine/types';
import type { WorldIndex } from '../engine/world';
import { reachedFoodCeiling } from '../results/learning';
import { assertTuningEvening, assertTuningEvenings, meansOf, rankSettings, type SettingMeans } from './objective';
import { paramsFor, type TunedPolicy, type TunedSetting } from './search';

/**
 * Runs the tuning search for one policy (sequential, one evening at a time) and the per-evening details the report
 * needs. Pure orchestration over the engine: no file access here (the gated test writes the files).
 * Every evening passed in must be a tuning evening; assertTuningEvenings refuses anything else.
 */

export interface SweepRow {
  setting: TunedSetting;
  means: SettingMeans;
}

/** Evaluates each setting on the tuning evenings, once each, with the evenings' fixed seeds. */
export function sweep(
  wx: WorldIndex,
  evenings: readonly Evening[],
  policy: TunedPolicy,
  settings: readonly TunedSetting[],
  progress?: (done: number, total: number) => void,
): SweepRow[] {
  assertTuningEvenings(evenings);
  return settings.map((setting, i) => {
    const params = paramsFor(policy, setting);
    const results: EveningResult[] = evenings.map((ev) => runEvening(wx, ev, { policy, params }).result);
    progress?.(i + 1, settings.length);
    return { setting, means: meansOf(results) };
  });
}

export interface EveningDetail {
  evening: string;
  foodKg: number;
  /** Posted kg minus food rescued (the engine's foodWastedKg). */
  foodWastedKg: number;
  /** null when no pantry needed anything that evening. */
  worstNeedMet: number | null;
  /** Pantries with need > 0 that received no on-time food. */
  pantriesLeftWithZero: number;
  pantriesWithNeed: number;
  strandedAwards: number;
  /** Food ceiling (assumption, decisions.md "Results screen defaults"): total need fully met. */
  ceilingHit: boolean;
  totalNeedKg: number;
}

/**
 * One evening under one policy and one parameter set (learning on, the engine default), with the per-pantry numbers the
 * report shows. Does not check the split: callers check it first (tuning: detailOf; pilot: assertPilotEvening).
 */
export function measureEvening(wx: WorldIndex, ev: Evening, policy: PolicyId, params: FrozenParams): EveningDetail {
  const { log, result } = runEvening(wx, ev, { policy, params });
  const onTime = new Map<string, number>();
  for (const { event } of log) {
    if (event.type === 'DELIVERY' && event.onTime) onTime.set(event.pantryId, (onTime.get(event.pantryId) ?? 0) + event.kg);
  }
  const needing = ev.needs.filter((n) => n.needKg > 0);
  const ceilingHit = reachedFoodCeiling(result, ev.needs);
  // Same fact, two ways: the ceiling is reached exactly when every needing pantry is fully met (worst-served = 1).
  if (ceilingHit !== (result.worstNeedMet === 1)) {
    throw new Error(`${ev.id}: ceiling (${ceilingHit}) and worst-served (${result.worstNeedMet}) disagree`);
  }
  return {
    evening: ev.id,
    foodKg: result.foodRescuedKg,
    foodWastedKg: result.foodWastedKg,
    worstNeedMet: result.worstNeedMet,
    pantriesLeftWithZero: needing.filter((n) => (onTime.get(n.pantryId) ?? 0) === 0).length,
    pantriesWithNeed: needing.length,
    strandedAwards: result.strandedAwards,
    ceilingHit,
    totalNeedKg: needing.reduce((s, n) => s + n.needKg, 0),
  };
}

export interface PolicyTuning {
  policy: TunedPolicy;
  rows: SweepRow[];
  /** Number of evaluated settings (budget + 1 untuned). */
  evaluated: number;
  feasibleCount: number;
  chosen: SweepRow;
  /** The ten best settings in select order (the chosen one first). */
  top10: SweepRow[];
  chosenParams: FrozenParams;
  chosenDetails: EveningDetail[];
  /** Tuning evenings on which the chosen setting's worst-served need met is 0. */
  zeroWorstEvenings: number;
}

/** Sweeps one policy, selects its setting and collects the chosen setting's per-evening table. */
export function tunePolicy(
  wx: WorldIndex,
  evenings: readonly Evening[],
  policy: TunedPolicy,
  settings: readonly TunedSetting[],
  progress?: (done: number, total: number) => void,
): PolicyTuning {
  assertTuningEvenings(evenings);
  const rows = sweep(wx, evenings, policy, settings, progress);
  const scored = rows.map((r) => ({ index: r.setting.index, foodKg: r.means.foodKg, worstNeedMet: r.means.worstNeedMet }));
  const ranked = rankSettings(scored);
  const byIndex = new Map(rows.map((r) => [r.setting.index, r]));
  const chosenRow = byIndex.get(ranked[0].index)!;
  const chosenParams = paramsFor(policy, chosenRow.setting, 'M6 tuning (chosen, not yet frozen)');
  const chosenDetails = evenings.map((ev) => detailOf(wx, ev, policy, chosenParams));
  return {
    policy,
    rows,
    evaluated: rows.length,
    feasibleCount: rows.filter((r) => r.means.feasible).length,
    chosen: chosenRow,
    top10: ranked.slice(0, 10).map((s) => byIndex.get(s.index)!),
    chosenParams,
    chosenDetails,
    zeroWorstEvenings: chosenDetails.filter((d) => d.worstNeedMet === 0).length,
  };
}

/** One tuning evening under one policy and one parameter set (the guard, then measureEvening). */
export function detailOf(wx: WorldIndex, ev: Evening, policy: PolicyId, params: FrozenParams): EveningDetail {
  assertTuningEvening(ev);
  return measureEvening(wx, ev, policy, params);
}

/** The untuned baselines (nothing to tune): the same per-evening table. */
export function baselineDetails(wx: WorldIndex, evenings: readonly Evening[], policy: PolicyId, params: FrozenParams): EveningDetail[] {
  assertTuningEvenings(evenings);
  return evenings.map((ev) => detailOf(wx, ev, policy, params));
}
