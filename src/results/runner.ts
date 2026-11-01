import { EVENINGS, WORLD } from '../data/dataset';
import { cappedMean } from '../engine/metrics';
import { POLICY_IDS } from '../engine/policies';
import { runEvening } from '../engine/simulate';
import type { Evening, EveningResult, FrozenParams, PolicyId } from '../engine/types';
import { indexWorld } from '../engine/world';
import { compareAll, type Comparison } from './intervals';
import { learningComparison, type LearningComparison } from './learning';
import { measureValue, MEASURES, type MeasureId } from './measures';
import { gateReasons, REGISTRATION, ResultsGateError, type Registration } from './registration';
import { verdictOf, type Verdict } from './verdict';

export { ResultsGateError };

export interface MainResults {
  evenings: string[];
  /** The finished runs behind the numbers, per policy, in evening order. Kept for the stored record and its tests. */
  perEvening: Record<PolicyId, EveningResult[]>;
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
  const perEvening = {} as Record<PolicyId, EveningResult[]>;
  for (const p of POLICY_IDS) perEvening[p] = [...runs[p]];
  return { evenings, perEvening, cells, comparisons, verdict: verdictOf(pick('foodRescued'), pick('needMet')) };
}

type GateInput = {
  params: FrozenParams;
  registration?: Registration;
  evenings?: readonly Evening[];
};

/**
 * The gate, checked before any evening runs. Refuses (throws) unless the pilot has run, the main-evening count and the
 * checksum are recorded, the parameters are real (never UNTUNED_PARAMS), only main_sample evenings are given, and the
 * count equals the evenings given.
 */
function openGate(input: GateInput): { reg: Registration; evenings: readonly Evening[] } {
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
  return { reg, evenings };
}

/** The four policies on the given evenings, learning on or off (RES-07). Callers run openGate first. */
function runPolicies(params: FrozenParams, evenings: readonly Evening[], learning: boolean): Record<PolicyId, EveningResult[]> {
  const wx = indexWorld(WORLD);
  const runs = {} as Record<PolicyId, EveningResult[]>;
  for (const policy of POLICY_IDS) {
    runs[policy] = evenings.map((e) => runEvening(wx, e, { policy, params, learning }).result);
  }
  return runs;
}

/**
 * Runs the four policies on the main evenings and summarises them. Refuses (throws) before any evening runs
 * unless the gate is open (see openGate).
 */
export function runMainResults(input: GateInput): MainResults {
  const { reg, evenings } = openGate(input);
  return summarize(runPolicies(input.params, evenings, true), reg);
}

/**
 * The learning-off comparison (RES-07): each policy on the main evenings with learning on and with learning off (every
 * driver's estimate fixed at 0.50), compared evening by evening. Supporting evidence only, never a main result.
 * Same gate as runMainResults.
 */
export function runLearningComparison(input: GateInput): Record<PolicyId, LearningComparison> {
  const { reg, evenings } = openGate(input);
  const on = runPolicies(input.params, evenings, true);
  const off = runPolicies(input.params, evenings, false);
  const out = {} as Record<PolicyId, LearningComparison>;
  for (const policy of POLICY_IDS) out[policy] = learningComparison(on[policy], off[policy], reg);
  return out;
}
