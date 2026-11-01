import { DATASET_VERSION } from '../data/dataset';
import { FROZEN_PARAMS } from '../engine/frozenParams';
import { POLICY_IDS } from '../engine/policies';
import type { FrozenParams, PolicyId } from '../engine/types';
import { NOT_MEASURED, RESULTS_COPY as C, SUPPORTING_LABELS } from './copy';
import { COMPARISONS, type Comparison, type PairSpec } from './intervals';
import type { LearningComparison } from './learning';
import { MEASURES, type MeasureId } from './measures';
import type { OnDeviceResults } from './onDevice';
import { gateReasons, MAIN_EVENINGS_IN_DATASET, REGISTRATION, type Registration } from './registration';
import { verdictLine } from './verdict';
import { insideGap } from './width';
import { kgValue, signed } from './units';

export interface Row {
  label: string;
  value: string;
}

export interface ScreenModel {
  /** True only when the screen shows the results of this session (openModel). Every number reads "Not measured yet" otherwise. */
  open: boolean;
  /** True when the run button shows: the gate is open and no result is shown yet. */
  canRun: boolean;
  /** The one plain line that says why no main result is shown; null only when open. */
  gateLine: string | null;
  /** Why no main result is shown. For tests only: the screen shows just gateLine. */
  reasons: string[];
  policies: { id: PolicyId; label: string; cells: Row[] }[];
  mainRows: Row[];
  /** The verdict and the two intervals it used (RES-04), or "Not measured yet". */
  verdict: string;
  /** The post-hoc supporting note under the verdict (both main intervals inside their gaps), or null. */
  postHocNote: string | null;
  supportingRows: Row[];
  learningRows: Row[];
  ceilingRows: Row[];
  footer: Row[];
}

const commas = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/** One cell: kg for food, a percentage for the worst-served need met, awards for stranded lots. */
export function formatCell(m: MeasureId, v: number | null): string {
  if (v === null) return NOT_MEASURED;
  if (m === 'needMet') return `${Math.round(v * 100)}%`;
  if (m === 'stranded') return `${v.toFixed(2)} awards`;
  return `${v.toFixed(1)} kg`;
}

/** Label of one comparison, from its spec: "Food rescued vs Central greedy". */
export function specLabel(s: PairSpec): string {
  return `${SUPPORTING_LABELS[s.measure]} vs ${C.policies[s.baseline]}`;
}

/** A paired interval: the mean and both bounds, in the measure's unit ("points" for need met). */
export function formatComparison(c: Comparison): string {
  const fmtVal = (x: number) =>
    c.measure === 'needMet' ? signed(x * 100, 1) : signed(x, c.measure === 'stranded' ? 2 : 1);
  const unit = c.measure === 'needMet' ? ' points' : c.measure === 'stranded' ? ' awards' : ' kg';
  const reading =
    c.reading === 'salo_better' ? C.saloBetter : c.reading === 'baseline_better' ? C.baselineBetter : C.noClear;
  return `${fmtVal(c.mean)}${unit} [${fmtVal(c.low)}, ${fmtVal(c.high)}] · ${reading}`;
}

/** One policy's learning-off comparison (supporting, RES-07): mean and bounds in kg, and the reading. */
function learningText(l: LearningComparison): string {
  const reading = l.reading === 'learning_helps' ? C.learningHelps : l.reading === 'learning_hurts' ? C.learningHurts : C.noClear;
  return `${kgValue(l.mean)} kg [${kgValue(l.low)}, ${kgValue(l.high)}] · ${reading}`;
}

function footer(reg: Registration, checksum: string): Row[] {
  return [
    { label: C.resamples, value: commas(reg.resamples) },
    { label: C.seed, value: String(reg.seed) },
    { label: C.checksum, value: checksum },
  ];
}

/**
 * Why no main result is shown: the gate's own reasons, and a recorded count that the dataset cannot meet. The runner
 * refuses such a count too (openGate: "The recorded count ... evenings were given"), so the screen must not offer a run.
 */
export function screenReasons(reg: Registration, params: FrozenParams | null): string[] {
  const reasons = gateReasons(reg, params);
  if (countMismatch(reg)) {
    reasons.push(`the recorded count is ${reg.mainEveningCount}, not the ${MAIN_EVENINGS_IN_DATASET} main evenings in the dataset`);
  }
  return reasons;
}

/** True when a count is recorded and it is not the number of main evenings in the dataset. */
function countMismatch(reg: Registration): boolean {
  return reg.mainEveningCount !== null && reg.mainEveningCount !== MAIN_EVENINGS_IN_DATASET;
}

/**
 * The one plain line for a screen with no main results. The record is complete but the count is not the dataset's:
 * the count line. Some other condition is missing: the gate line. Nothing missing: the pilot-recorded line.
 */
function gateLineFor(reg: Registration, params: FrozenParams | null, reasons: readonly string[]): string {
  if (reasons.length === 0) return C.gateRecordedNoRun;
  if (gateReasons(reg, params).length === 0 && countMismatch(reg)) return C.gateCountMismatch;
  return C.gateClosed;
}

/**
 * The screen with no results: every cell, interval and verdict reads "Not measured yet". With the gate open, the run
 * button is offered (canRun). The rows come from the same twelve-comparison table the open screen uses.
 */
export function closedModel(reg: Registration = REGISTRATION, params: FrozenParams | null = null): ScreenModel {
  const pending = (label: string): Row => ({ label, value: NOT_MEASURED });
  const reasons = screenReasons(reg, params);
  return {
    open: false,
    canRun: reasons.length === 0,
    gateLine: gateLineFor(reg, params, reasons),
    reasons,
    policies: POLICY_IDS.map((p) => ({
      id: p,
      label: C.policies[p],
      cells: MEASURES.map((m) => ({ label: C.measures[m], value: NOT_MEASURED })),
    })),
    mainRows: COMPARISONS.filter((s) => s.main).map((s) => pending(specLabel(s))),
    verdict: NOT_MEASURED,
    postHocNote: null,
    supportingRows: COMPARISONS.filter((s) => !s.main).map((s) => pending(`${specLabel(s)} (95%)`)),
    learningRows: POLICY_IDS.map((p) => pending(`${C.policies[p]} · ${C.learningRow}`)),
    ceilingRows: POLICY_IDS.map((p) => pending(C.policies[p])),
    footer: footer(reg, NOT_MEASURED),
  };
}

/**
 * The screen with the results of this session (onDevice.ts). Every number is formatted from `run`; nothing is computed
 * here. The footer names the dataset, the resamples, the seed and the frozen parameters checksum.
 */
export function openModel(run: OnDeviceResults, reg: Registration = REGISTRATION): ScreenModel {
  const { main } = run;
  const mainRows = main.comparisons.filter((c) => c.main).map((c) => ({ label: specLabel(c), value: formatComparison(c) }));
  const supportingRows = main.comparisons
    .filter((c) => !c.main)
    .map((c) => ({ label: `${specLabel(c)} (95%)`, value: formatComparison(c) }));
  const food = main.comparisons.find((c) => c.main && c.measure === 'foodRescued');
  const fair = main.comparisons.find((c) => c.main && c.measure === 'needMet');
  if (!food || !fair) throw new Error('the open screen needs both main comparisons');
  const total = main.evenings.length;
  return {
    open: true,
    canRun: false,
    gateLine: null,
    reasons: [],
    policies: POLICY_IDS.map((p) => ({
      id: p,
      label: C.policies[p],
      cells: MEASURES.map((m) => ({ label: C.measures[m], value: formatCell(m, main.cells[p][m]) })),
    })),
    mainRows,
    verdict: verdictLine({ low: food.low, high: food.high }, { low: fair.low, high: fair.high }),
    postHocNote: insideGap(food) && insideGap(fair) ? C.insideGapsNote : null,
    supportingRows,
    learningRows: POLICY_IDS.map((p) => ({
      label: `${C.policies[p]} · ${C.learningRow}`,
      value: learningText(run.learning[p]),
    })),
    ceilingRows: POLICY_IDS.map((p) => ({
      label: C.policies[p],
      value: C.ceilingOf(run.postedCeilings[p], total),
    })),
    footer: [{ label: C.dataset, value: DATASET_VERSION }, ...footer(reg, reg.frozenParamsChecksum ?? NOT_MEASURED)],
  };
}

/**
 * What the Results screen shows. `run` is the results of this session, or null when none has been run. The screen shows
 * them only while the gate is open (screenReasons is empty). With no run, or a closed gate, every number reads "Not
 * measured yet". Nothing is stored in the build and nothing is computed here.
 */
export function currentModel(
  run: OnDeviceResults | null,
  reg: Registration = REGISTRATION,
  params: FrozenParams | null = FROZEN_PARAMS,
): ScreenModel {
  if (screenReasons(reg, params).length || run === null) return closedModel(reg, params);
  return openModel(run, reg);
}
