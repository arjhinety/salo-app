import { DATASET_VERSION, EVENINGS } from '../data/dataset';
import { FROZEN_PARAMS } from '../engine/frozenParams';
import { POLICY_IDS } from '../engine/policies';
import type { FrozenParams, PolicyId } from '../engine/types';
import { NOT_MEASURED, RESULTS_COPY as C, SUPPORTING_LABELS } from './copy';
import { PERSISTED_MAIN_RESULTS } from './mainResults.generated';
import { COMPARISONS, type Comparison, type PairSpec } from './intervals';
import type { LearningComparison } from './learning';
import { MEASURES, type MeasureId } from './measures';
import { gateReasons, MAIN_EVENINGS_IN_DATASET, REGISTRATION, type Registration } from './registration';
import { persistedMismatch, type PersistedMainResults } from './persisted';
import type { MainResults } from './runner';
import { verdictLine } from './verdict';

export interface Row {
  label: string;
  value: string;
}

export interface ScreenModel {
  /**
   * True only when the screen shows the stored main results (openModel). currentModel shows them only when the gate is
   * open and the stored record matches the registration, the frozen parameters and the dataset. Otherwise every number
   * reads "Not measured yet".
   */
  open: boolean;
  /** The one plain line that says why no main result is shown; null only when open. */
  gateLine: string | null;
  /** Why no main result is shown. For tests only: the screen shows just gateLine. */
  reasons: string[];
  policies: { id: PolicyId; label: string; cells: Row[] }[];
  mainRows: Row[];
  /** The verdict and the two intervals it used (RES-04), or "Not measured yet". */
  verdict: string;
  supportingRows: Row[];
  learningRows: Row[];
  ceilingRows: Row[];
  footer: Row[];
}

const MINUS = '−';
const signed = (x: number, digits: number) => `${x >= 0 ? '+' : MINUS}${Math.abs(x).toFixed(digits)}`;
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
  const reading = l.reading === 'learning_helps' ? 'learning helps' : l.reading === 'learning_hurts' ? 'learning hurts' : C.noClear;
  return `${signed(l.mean, 1)} kg [${signed(l.low, 1)}, ${signed(l.high, 1)}] · ${reading}`;
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
 * refuses such a count too (openGate: "The recorded count ... evenings were given"), so the screen must not show open.
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
 * The screen with no main results: every cell, interval and verdict reads "Not measured yet". The rows come from the
 * same twelve-comparison table the open screen uses, so this screen lists every comparison.
 */
export function closedModel(reg: Registration = REGISTRATION, params: FrozenParams | null = null): ScreenModel {
  const pending = (label: string): Row => ({ label, value: NOT_MEASURED });
  const reasons = screenReasons(reg, params);
  return {
    open: false,
    gateLine: gateLineFor(reg, params, reasons),
    reasons,
    policies: POLICY_IDS.map((p) => ({
      id: p,
      label: C.policies[p],
      cells: MEASURES.map((m) => ({ label: C.measures[m], value: NOT_MEASURED })),
    })),
    mainRows: COMPARISONS.filter((s) => s.main).map((s) => pending(specLabel(s))),
    verdict: NOT_MEASURED,
    supportingRows: COMPARISONS.filter((s) => !s.main).map((s) => pending(`${specLabel(s)} (95%)`)),
    learningRows: POLICY_IDS.map((p) => pending(`${C.policies[p]} · ${C.learningRow}`)),
    ceilingRows: POLICY_IDS.map((p) => pending(C.policies[p])),
    footer: footer(reg, NOT_MEASURED),
  };
}

/**
 * The screen with the stored main results. Reached only when the gate is open and the stored record matches (see
 * currentModel). Every number comes from `main`, the stored summary; nothing is computed here.
 */
export function openModel(
  main: MainResults,
  reg: Registration,
  checksum: string,
  extras: { learning?: Record<PolicyId, LearningComparison>; ceilings?: Record<PolicyId, number>; dataset?: string } = {},
): ScreenModel {
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
    gateLine: null,
    reasons: [],
    policies: POLICY_IDS.map((p) => ({
      id: p,
      label: C.policies[p],
      cells: MEASURES.map((m) => ({ label: C.measures[m], value: formatCell(m, main.cells[p][m]) })),
    })),
    mainRows,
    verdict: verdictLine({ low: food.low, high: food.high }, { low: fair.low, high: fair.high }),
    supportingRows,
    learningRows: POLICY_IDS.map((p) => ({
      label: `${C.policies[p]} · ${C.learningRow}`,
      value: extras.learning ? learningText(extras.learning[p]) : NOT_MEASURED,
    })),
    ceilingRows: POLICY_IDS.map((p) => ({
      label: C.policies[p],
      value: extras.ceilings ? C.ceilingOf(extras.ceilings[p], total) : NOT_MEASURED,
    })),
    footer: [
      ...(extras.dataset ? [{ label: C.dataset, value: extras.dataset }] : []),
      ...footer(reg, checksum),
    ],
  };
}

/**
 * What the Results screen shows. It reads the stored main results (src/results/mainResults.generated.ts) and shows them
 * only when the gate is open and the stored record matches the registration, the frozen parameters and the dataset
 * (persistedMismatch). It never runs an evening, so nothing is computed at app start. Otherwise the screen is closed.
 */
export function currentModel(
  stored: PersistedMainResults = PERSISTED_MAIN_RESULTS,
  reg: Registration = REGISTRATION,
  params: FrozenParams | null = FROZEN_PARAMS,
): ScreenModel {
  const reasons = screenReasons(reg, params);
  if (reasons.length) return closedModel(reg, params);
  const mainIds = EVENINGS.filter((e) => e.split === 'main_sample').map((e) => e.id);
  const stale = persistedMismatch(stored, reg, params, mainIds, DATASET_VERSION);
  if (stale.length) return { ...closedModel(reg, params), gateLine: C.gateStale, reasons: stale };
  return openModel(stored.main, reg, stored.frozenParamsChecksum, {
    learning: stored.learning,
    ceilings: stored.ceilings,
    dataset: stored.dataset.version,
  });
}
