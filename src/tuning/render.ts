import type { UtilityWeights } from '../engine/types';
import type { EveningDetail, PolicyTuning, SweepRow } from './run';
import { WORST_TARGET } from './objective';
import { SCALE_MAX, SCALE_MIN, PENALTY_MAX } from './search';

/** Fairness rule (decisions.md, "M6 tuning and pilot"): this many or more zero evenings means STOP. */
export const FAIRNESS_STOP_AT = 6;

export const LABEL = 'Tuning evenings E01-E10, in-sample, not a result.';

export interface TuningReport {
  date: string;
  seed: number;
  budget: number;
  runtimeSeconds: number;
  salo: PolicyTuning;
  centralGreedy: PolicyTuning;
  fcfs: EveningDetail[];
  nearest: EveningDetail[];
}

const f2 = (x: number) => x.toFixed(2);
const f3 = (x: number) => x.toFixed(3);
const fw = (w: UtilityWeights) => `${f2(w.need)} / ${f2(w.storage)} / ${f2(w.distance)} / ${f2(w.freshness)}`;
const yn = (b: boolean) => (b ? 'yes' : 'no');
const worstCell = (x: number | null) => (x === null ? 'n/a' : f3(x));

export function fairnessVerdict(zeroSalo: number): 'PASS' | 'STOP' {
  return zeroSalo >= FAIRNESS_STOP_AT ? 'STOP' : 'PASS';
}

function knobText(policy: 'salo' | 'central_greedy', knob: number): string {
  return policy === 'salo' ? `scale ${knob}` : `penalty ${knob.toFixed(5)} per min`;
}

function settingRow(policy: 'salo' | 'central_greedy', r: SweepRow, rank: number): string {
  return `| ${rank} | ${r.setting.index} | ${fw(r.setting.weights)} | ${knobText(policy, r.setting.knob)} | ${f2(r.means.foodKg)} | ${f3(r.means.worstNeedMet)} | ${yn(r.means.feasible)} |`;
}

function perEvening(rows: readonly EveningDetail[]): string[] {
  const out = ['| Evening | Food rescued (kg) | Worst-served need met | Pantries left with 0 kg | Stranded awards | Food ceiling hit |', '|---|---|---|---|---|---|'];
  for (const d of rows) {
    out.push(`| ${d.evening} | ${f2(d.foodKg)} | ${worstCell(d.worstNeedMet)} | ${d.pantriesLeftWithZero} of ${d.pantriesWithNeed} | ${d.strandedAwards} | ${yn(d.ceilingHit)} |`);
  }
  const mean = (f: (d: EveningDetail) => number) => rows.reduce((s, d) => s + f(d), 0) / rows.length;
  const meanWorst = rows.filter((d) => d.worstNeedMet !== null);
  const worstMean = meanWorst.reduce((s, d) => s + (d.worstNeedMet ?? 0), 0) / meanWorst.length;
  out.push(
    `| **Mean** | **${f2(mean((d) => d.foodKg))}** | **${f3(worstMean)}** | ${f2(mean((d) => d.pantriesLeftWithZero))} avg | ${f2(mean((d) => d.strandedAwards))} avg | ${rows.filter((d) => d.ceilingHit).length} of ${rows.length} |`,
  );
  return out;
}

/** The markdown report, docs/reports/m6-tuning.md. Every table is labelled tuning, in-sample. */
export function renderReport(rep: TuningReport): string {
  const { salo, centralGreedy: cg } = rep;
  const verdict = fairnessVerdict(salo.zeroWorstEvenings);
  const lines: string[] = [
    '# M6 tuning, E01-E10: in-sample, not a result',
    '',
    `**${LABEL}** The settings below were chosen on these ten evenings, so none of these numbers is evidence about Salo or any other policy. The only reported results are the main evenings (E21-E64, Results screen).`,
    '',
    `Written by the gated runner \`src/tuning/__tests__/m6-tuning-run.test.ts\` (M6_TUNING=1) on ${rep.date}. Runtime ${rep.runtimeSeconds.toFixed(0)} s, one process, one evening at a time. Sampler seed ${rep.seed}, budget ${rep.budget} sampled settings per policy plus setting 0 (untuned) = ${rep.budget + 1} evaluated.`,
    '',
    '## Method (fixed in docs/decisions.md before the run)',
    '',
    `- Target: maximise mean food rescued (kg per evening) over E01-E10, subject to the mean over E01-E10 of each evening's worst-served need met being at least ${WORST_TARGET}. If no setting reaches ${WORST_TARGET}, the one closest to it is used, ties to more food.`,
    '- Weights: Dirichlet(1,1,1,1) on the simplex, drawn from the engine counter-based RNG with the tuning streams (101 weights, 102 Salo scale, 103 central penalty). Salo and central greedy draw the same weight vectors at the same index.',
    `- Salo's share-bid scale: whole numbers ${SCALE_MIN} to ${SCALE_MAX}. Central greedy's transport penalty: uniform on [0, ${PENALTY_MAX}) per minute.`,
    '- Setting 0 is the untuned starting setting (weights 0.40 / 0.30 / 0.15 / 0.15; scale 17; penalty 0.005 per minute).',
    '- Driver reliability starts from the dataset tuning counts on every evening (no carry-over). The 40-share budget and every other engine rule are unchanged.',
    '',
    '## Chosen settings',
    '',
    '| Policy | Chosen setting (index) | Weights (need / storage / distance / freshness) | Knob | Mean food rescued (kg/evening) | Mean worst-served need met | Feasible (>= 0.5) | Feasible settings of ' + (rep.budget + 1) + ' |',
    '|---|---|---|---|---|---|---|---|',
    `| Agents (Salo) | ${salo.chosen.setting.index} | ${fw(salo.chosen.setting.weights)} | ${knobText('salo', salo.chosen.setting.knob)} | ${f2(salo.chosen.means.foodKg)} | ${f3(salo.chosen.means.worstNeedMet)} | ${yn(salo.chosen.means.feasible)} | ${salo.feasibleCount} |`,
    `| Central greedy | ${cg.chosen.setting.index} | ${fw(cg.chosen.setting.weights)} | ${knobText('central_greedy', cg.chosen.setting.knob)} | ${f2(cg.chosen.means.foodKg)} | ${f3(cg.chosen.means.worstNeedMet)} | ${yn(cg.chosen.means.feasible)} | ${cg.feasibleCount} |`,
    '',
    'Fairness-check count (tuning evenings with worst-served need met = 0 for the chosen setting): Salo ' +
      `${salo.zeroWorstEvenings} of 10, central greedy ${cg.zeroWorstEvenings} of 10.`,
    '',
    '## Top 10 settings per policy (select order; rank 1 is the chosen one)',
    '',
    '### Agents (Salo)',
    '',
    '| Rank | Index | Weights (need / storage / distance / freshness) | Knob | Food (kg/evening) | Worst-served need met | Feasible |',
    '|---|---|---|---|---|---|---|',
    ...salo.top10.map((r, i) => settingRow('salo', r, i + 1)),
    '',
    '### Central greedy',
    '',
    '| Rank | Index | Weights (need / storage / distance / freshness) | Knob | Food (kg/evening) | Worst-served need met | Feasible |',
    '|---|---|---|---|---|---|---|',
    ...cg.top10.map((r, i) => settingRow('central_greedy', r, i + 1)),
    '',
    '## Per-evening table: Agents (Salo), chosen setting (tuning, in-sample)',
    '',
    ...perEvening(salo.chosenDetails),
    '',
    '"Pantries left with 0 kg": pantries with need above 0 that received no on-time food. Worst-served need met is 0 exactly when at least one such pantry got nothing.',
    '',
    '## Per-evening table: central greedy, chosen setting (tuning, in-sample)',
    '',
    ...perEvening(cg.chosenDetails),
    '',
    '## Per-evening table: first come, first served and nearest pantry, untuned (tuning, in-sample)',
    '',
    'These two have no setting to tune, so they run once with the untuned parameters. Shown for the ceiling-frequency report.',
    '',
    '### First come, first served (fcfs)',
    '',
    ...perEvening(rep.fcfs),
    '',
    '### Nearest pantry',
    '',
    ...perEvening(rep.nearest),
    '',
    '## Food ceiling frequency (tuning, in-sample; ceiling = total need fully met, an assumption from decisions.md)',
    '',
    '| Policy | Evenings at the ceiling (of 10) | Setting |',
    '|---|---|---|',
    `| Agents (Salo) | ${salo.chosenDetails.filter((d) => d.ceilingHit).length} | tuned, index ${salo.chosen.setting.index} |`,
    `| Central greedy | ${cg.chosenDetails.filter((d) => d.ceilingHit).length} | tuned, index ${cg.chosen.setting.index} |`,
    `| First come, first served | ${rep.fcfs.filter((d) => d.ceilingHit).length} | untuned |`,
    `| Nearest pantry | ${rep.nearest.filter((d) => d.ceilingHit).length} | untuned |`,
    '',
    '## Fairness check (decisions.md, "M6 tuning and pilot"; rule: 6 or more of 10 zero means STOP)',
    '',
    `Tuned Salo's worst-served need met is 0 on ${salo.zeroWorstEvenings} of 10 tuning evenings. Tuned central greedy: ${cg.zeroWorstEvenings} of 10 (reported for comparison; the rule is about Salo).`,
    '',
    verdict === 'STOP'
      ? '**FAIRNESS CHECK: STOP — Arjhine picks a replacement measure** before any pilot run.'
      : '**FAIRNESS CHECK: PASS**',
    '',
    '## Settings file',
    '',
    'All 401 settings per policy with both means, the feasibility flag and the chosen flag: `docs/reports/m6-tuning/settings.csv`. The chosen parameters: `docs/reports/m6-tuning/chosen-params.json`.',
    '',
  ];
  return lines.join('\n');
}

/**
 * One row per sampled setting: the weights are the same for both policies at the same index (shared weight stream).
 * Means are over E01-E10 (in-sample).
 */
export function renderSettingsCsv(salo: PolicyTuning, cg: PolicyTuning): string {
  const head = [
    'index', 'w_need', 'w_storage', 'w_distance', 'w_freshness',
    'salo_scale', 'salo_food_kg', 'salo_worst_need_met', 'salo_feasible', 'salo_chosen',
    'cg_penalty_per_min', 'cg_food_kg', 'cg_worst_need_met', 'cg_feasible', 'cg_chosen',
  ];
  const out = [head.join(',')];
  if (salo.rows.length !== cg.rows.length) throw new Error('policies evaluated different numbers of settings');
  salo.rows.forEach((s, i) => {
    const c = cg.rows[i];
    if (s.setting.index !== c.setting.index) throw new Error(`index mismatch at row ${i}`);
    const w = s.setting.weights;
    const cw = c.setting.weights;
    if (w.need !== cw.need || w.storage !== cw.storage || w.distance !== cw.distance || w.freshness !== cw.freshness) {
      throw new Error(`weights differ at index ${s.setting.index}: the streams are not shared`);
    }
    out.push([
      s.setting.index, w.need, w.storage, w.distance, w.freshness,
      s.setting.knob, s.means.foodKg, s.means.worstNeedMet, s.means.feasible ? 1 : 0,
      s.setting.index === salo.chosen.setting.index ? 1 : 0,
      c.setting.knob, c.means.foodKg, c.means.worstNeedMet, c.means.feasible ? 1 : 0,
      c.setting.index === cg.chosen.setting.index ? 1 : 0,
    ].join(','));
  });
  return out.join('\n') + '\n';
}
