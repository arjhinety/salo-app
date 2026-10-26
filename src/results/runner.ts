import { EVENINGS, WORLD } from '../data/dataset';
import { cappedMean } from '../engine/metrics';
import { POLICY_IDS } from '../engine/policies';
import { runEvening } from '../engine/simulate';
import type { Evening, EveningResult, FrozenParams, PolicyId } from '../engine/types';
import { indexWorld } from '../engine/world';
import { compareAll, type Comparison } from './intervals';
import { measureValue, MEASURES, type MeasureId } from './measures';
import { gateReasons, REGISTRATION, ResultsGateError, type Registration } from './registration';
import { verdictOf, type Verdict } from './verdict';

export { ResultsGateError };

export interface MainResults {
  evenings: string[];
  /** Mean per evening of each measure, by policy. Null when no evening has a value. */
  cells: Record<PolicyId, Record<MeasureId, number | null>>;
  /** Twelve comparisons: the two main ones (97.5%) and ten supporting ones (95%). */
  comparisons: Comparison[];
  verdict: Verdict;
}

/** The held-out evenings only (RES-06). Tuning (E01-E10) and pilot (E11-E20) evenings are never selected. */
export function mainEvenings(all: readonly Evening[]): Evening[] {
  return all.filter((e) => e.split === 'main_sample');
}

function cellValue(results: readonly EveningResult[], m: MeasureId): number | null {
  const values = results.map((r) => measureValue(r, m));
  if (m === 'needMet') return cappedMean(values, 1);
  const kept = values.filter((v): v is number => v !== null);
  return kept.length ? kept.reduce((s, v) => s + v, 0) / kept.length : null;
}

/**
 * Folds finished runs into the screen's numbers: per-evening means, the twelve paired comparisons and the verdict.
 * Pure: no engine call. Every policy must cover the same evenings in the same order.
 */
export function summarize(
  runs: Record<PolicyId, readonly EveningResult[]>,
  reg: Pick<Registration, 'resamples' | 'seed'> = REGISTRATION,
): MainResults {
  const evenings = runs.salo.map((r) => r.evening);
  const cells = {} as MainResults['cells'];
  for (const p of POLICY_IDS) {
    cells[p] = {} as Record<MeasureId, number | null>;
    for (const m of MEASURES) cells[p][m] = cellValue(runs[p], m);
  }
  const comparisons = compareAll(runs, reg.resamples, reg.seed);
  const pick = (m: MeasureId) => {
    const c = comparisons.find((x) => x.main && x.measure === m);
    if (!c) throw new Error(`missing main comparison for ${m}`);
    return { low: c.low, high: c.high };
  };
  return { evenings, cells, comparisons, verdict: verdictOf(pick('foodRescued'), pick('needMet')) };
}

/**
 * Runs the four policies on the main evenings and summarises them. Refuses (throws) before any evening runs
 * unless the gate is open: pilot run, main-evening count recorded, checksum recorded, real frozen parameters
 * (never UNTUNED_PARAMS), and the count equal to the evenings given.
 */
export function runMainResults(input: {
  params: FrozenParams;
  registration?: Registration;
  evenings?: readonly Evening[];
}): MainResults {
  const reg = input.registration ?? REGISTRATION;
  const evenings = input.evenings ?? mainEvenings(EVENINGS);
  const reasons = gateReasons(reg, input.params);
  if (reasons.length) throw new ResultsGateError(`Results are gated: ${reasons.join('; ')}.`);
  if (evenings.some((e) => e.split !== 'main_sample')) {
    throw new ResultsGateError('Only main_sample evenings are reported.');
  }
  if (evenings.length !== reg.mainEveningCount) {
    throw new ResultsGateError(`The recorded count is ${reg.mainEveningCount} but ${evenings.length} evenings were given.`);
  }
  const wx = indexWorld(WORLD);
  const runs = {} as Record<PolicyId, EveningResult[]>;
  for (const policy of POLICY_IDS) {
    runs[policy] = evenings.map((e) => runEvening(wx, e, { policy, params: input.params }).result);
  }
  return summarize(runs, reg);
}
