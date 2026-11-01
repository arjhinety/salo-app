import { FROZEN_PARAMS } from '../engine/frozenParams';
import { POLICY_IDS } from '../engine/policies';
import type { FrozenParams, PolicyId } from '../engine/types';
import { NOT_MEASURED, RESULTS_COPY as C, SUPPORTING_LABELS } from './copy';
import { COMPARISONS, type Comparison, type PairSpec } from './intervals';
import type { LearningComparison } from './learning';
import { MEASURES, type MeasureId } from './measures';
import { gateReasons, REGISTRATION, type Registration } from './registration';
import type { MainResults } from './runner';
import { VERDICT_LABEL } from './verdict';

export interface Row {
  label: string;
  value: string;
}

export interface ScreenModel {
  /** False while the pre-registration gate is closed. Every number then reads "Not measured yet". */
  open: boolean;
  /** The one plain line that says why the main results are gated; null when open. */
  gateLine: string | null;
  /** Why the gate is closed. For tests only: the screen shows just gateLine. */
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
 * The gated screen: every cell, interval and verdict reads "Not measured yet". The rows come from the same
 * twelve-comparison table the open screen uses, so the closed screen lists every comparison.
 */
export function closedModel(reg: Registration = REGISTRATION, params: FrozenParams | null = null): ScreenModel {
  const pending = (label: string): Row => ({ label, value: NOT_MEASURED });
  return {
    open: false,
    gateLine: C.gateClosed,
    reasons: gateReasons(reg, params),
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

/** What the screen shows today: the gate is closed (no pilot and no main-evening count; the frozen parameters are in the build). */
export function currentModel(): ScreenModel {
  return closedModel(REGISTRATION, FROZEN_PARAMS);
}
