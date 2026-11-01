import { FROZEN_PARAMS } from '../engine/frozenParams';
import { POLICY_IDS } from '../engine/policies';
import type { FrozenParams, PolicyId } from '../engine/types';
import { NOT_MEASURED, RESULTS_COPY as C, SUPPORTING_LABELS } from './copy';
import { COMPARISONS, type Comparison, type PairSpec } from './intervals';
import type { LearningComparison } from './learning';
import { MEASURES, type MeasureId } from './measures';
import { gateReasons, MAIN_EVENINGS_IN_DATASET, REGISTRATION, type Registration } from './registration';
import type { MainResults } from './runner';
import { VERDICT_LABEL } from './verdict';

export interface Row {
  label: string;
  value: string;
}

export interface ScreenModel {
  /**
   * True only when the screen shows computed main results (openModel). currentModel never computes them, so it is
   * false even when the record is complete. Every number then reads "Not measured yet".
   */
  open: boolean;
  /** The one plain line that says why no main result is shown; null only in openModel. */
  gateLine: string | null;
  /** Why no main result is shown. For tests only: the screen shows just gateLine. */
  reasons: string[];
  policies: { id: PolicyId; label: string; cells: Row[] }[];
  mainRows: Row[];
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
    learningRows: [pending('Food rescued, learning on minus off (95%)')],
    ceilingRows: POLICY_IDS.map((p) => pending(C.policies[p])),
    footer: footer(reg, NOT_MEASURED),
  };
}

/** The screen once the gate is open and the runs are summarised. Reached only after the pre-registration is written. */
export function openModel(
  main: MainResults,
  reg: Registration,
  checksum: string,
  extras: { learning?: LearningComparison; ceilings?: Record<PolicyId, number> } = {},
): ScreenModel {
  const mainRows = main.comparisons.filter((c) => c.main).map((c) => ({ label: specLabel(c), value: formatComparison(c) }));
  const supportingRows = main.comparisons
    .filter((c) => !c.main)
    .map((c) => ({ label: `${specLabel(c)} (95%)`, value: formatComparison(c) }));
  const learning = extras.learning;
  const learningValue = learning
    ? `${signed(learning.mean, 1)} kg [${signed(learning.low, 1)}, ${signed(learning.high, 1)}] · ${
        learning.reading === 'learning_helps' ? 'learning helps' : learning.reading === 'learning_hurts' ? 'learning hurts' : C.noClear
      }`
    : NOT_MEASURED;
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
    verdict: VERDICT_LABEL[main.verdict],
    supportingRows,
    learningRows: [{ label: 'Food rescued, learning on minus off (95%)', value: learningValue }],
    ceilingRows: POLICY_IDS.map((p) => ({
      label: C.policies[p],
      value: extras.ceilings ? String(extras.ceilings[p]) : NOT_MEASURED,
    })),
    footer: footer(reg, checksum),
  };
}

/**
 * What the screen shows today: no main result. The pilot is recorded and the count is 44, which dataset v1.3 matches
 * (44 main evenings), so the gate's checks pass, but no main evening has been run. This function never runs an evening.
 */
export function currentModel(): ScreenModel {
  return closedModel(REGISTRATION, FROZEN_PARAMS);
}
