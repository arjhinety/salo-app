import type { PolicyId } from '../engine/types';
import { MAIN_EVENINGS_IN_DATASET } from '../results/registration';
import type { EveningDetail } from './run';
import { CHI2_LOWER_20_DF9, GAP_FAIR, GAP_FOOD_KG, MIN_MAIN_EVENINGS, SD_UPPER_FACTOR, Z_975, type MeasureCount, type PilotCount } from './pilotCount';

/**
 * Markdown for docs/reports/m6-pilot.md. Pure: takes the pilot numbers, returns text. The pilot is never a result, so
 * the report has no bootstrap interval and no verdict. Its title line is the required label.
 */

/** The label required at the top of the pilot report (docs/decisions.md, M6 step 2). */
export const PILOT_LABEL = 'Pilot evenings E11–E20: used only to set the main-evening count; not a result, never reported as one.';

export interface PilotReport {
  date: string;
  checksum: string;
  /** Per policy, per evening, in evening order E11..E20. */
  perPolicy: Record<PolicyId, EveningDetail[]>;
  count: PilotCount;
}

const LABEL: Record<PolicyId, string> = {
  salo: 'Agents (Salo)',
  central_greedy: 'Central greedy',
  fcfs: 'First come, first served',
  nearest: 'Nearest pantry',
};
const ORDER: PolicyId[] = ['salo', 'central_greedy', 'fcfs', 'nearest'];

const f2 = (x: number) => x.toFixed(2);
const f3 = (x: number) => x.toFixed(3);
const f4 = (x: number) => x.toFixed(4);
const signed = (x: number, d: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(d)}`;

/** The unrounded n = (2 × 2.2414 × s_U / gap)², shown before the ceiling. */
export const rawEvenings = (m: MeasureCount) => (2 * Z_975 * m.sU / m.gap) ** 2;

function perPolicyTable(rows: EveningDetail[]): string {
  const head = [
    '| Evening | Food rescued (kg) | Worst-served need met | Food wasted (kg) | Stranded awards | Pantries left with 0 kg | Food ceiling hit |',
    '|---|---|---|---|---|---|---|',
  ];
  const body = rows.map((r) =>
    `| ${r.evening} | ${f2(r.foodKg)} | ${r.worstNeedMet === null ? 'none needed' : f3(r.worstNeedMet)} | ${f2(r.foodWastedKg)} | ${r.strandedAwards} | ${r.pantriesLeftWithZero} of ${r.pantriesWithNeed} | ${r.ceilingHit ? 'yes' : 'no'} |`,
  );
  return [...head, ...body].join('\n');
}

function diffTable(salo: EveningDetail[], cg: EveningDetail[], count: PilotCount): string {
  const head = [
    '| Evening | Salo food (kg) | Central greedy food (kg) | d food (kg) | Salo worst-served | Central greedy worst-served | d fair |',
    '|---|---|---|---|---|---|---|',
  ];
  const body = salo.map((s, i) => {
    const c = cg[i];
    return `| ${s.evening} | ${f2(s.foodKg)} | ${f2(c.foodKg)} | ${signed(count.food.diffs[i], 2)} | ${f3(s.worstNeedMet!)} | ${f3(c.worstNeedMet!)} | ${signed(count.fair.diffs[i], 3)} |`;
  });
  return [...head, ...body].join('\n');
}

function measureLines(name: string, m: MeasureCount, unit: string, gapText: string, dDigits: number): string {
  const raw = rawEvenings(m);
  return [
    `### ${name}`,
    '',
    `- Gap (smallest worth caring about): ${gapText}.`,
    `- Mean of the ten differences d: ${signed(m.mean, dDigits)} ${unit}.`,
    `- Sample SD s (n − 1 = 9): ${f4(m.sd)} ${unit}.`,
    `- s_U = ${SD_UPPER_FACTOR.toFixed(4)} × ${f4(m.sd)} = ${f4(m.sU)} ${unit}.`,
    `- n = ceil((2 × ${Z_975} × ${f4(m.sU)} / ${m.gap})²) = ceil(${raw.toFixed(4)}) = **${m.n}** evenings.`,
    '',
  ].join('\n');
}

export function renderPilotReport(rep: PilotReport): string {
  const salo = rep.perPolicy.salo;
  const cg = rep.perPolicy.central_greedy;
  const { food, fair, count } = rep.count;
  const ceilingRows = ORDER.map((p) => `| ${LABEL[p]} | ${rep.perPolicy[p].filter((d) => d.ceilingHit).length} of ${rep.perPolicy[p].length} |`);
  const extra =
    count > MAIN_EVENINGS_IN_DATASET
      ? `The count exceeds the ${MAIN_EVENINGS_IN_DATASET} main evenings in dataset v1.2 → more main evenings must be generated (Arjhine's decision). Nothing was generated here.`
      : `The count (${count}) does not exceed the ${MAIN_EVENINGS_IN_DATASET} main evenings in dataset v1.2.`;

  return [
    `# ${PILOT_LABEL}`,
    '',
    `Written by the gated runner \`src/tuning/__tests__/m6-pilot-run.test.ts\` (M6_PILOT=1) on ${rep.date}. Evenings E11–E20 only (split \`pilot\`, asserted). Frozen parameters \`${rep.checksum}\`, the settings in \`src/engine/frozenParams.ts\`. Learning on, the engine default. All four policies, the same evenings.`,
    '',
    '**No bootstrap interval and no verdict is computed or shown for the pilot.** The main results come only from the main run (guide p.19).',
    '',
    '## Method',
    '',
    '- d = Salo minus central greedy, evening by evening: food rescued (kg) and worst-served need met.',
    '- Each evening starts from the dataset\'s frozen tuning reliability counts, so nothing learned in one evening carries into the next (guide p.15).',
    `- Food ceiling (assumption, decisions.md): total need fully met on the evening. The ceiling is reached when every pantry with need is fully served.`,
    `- Count rule (decisions.md, amended 2026-11-01): s_U = s × √(9 / χ²₀.₂₀,₉) with χ²₀.₂₀,₉ = ${CHI2_LOWER_20_DF9}, so the factor is ${SD_UPPER_FACTOR.toFixed(5)} (= 1.2934). n = ceil((2 × ${Z_975} × s_U / gap)²). Count = max(n_food, n_fair, ${MIN_MAIN_EVENINGS}).`,
    '',
    '## Per-evening results: Agents (Salo), frozen settings',
    '',
    perPolicyTable(salo),
    '',
    '## Per-evening results: central greedy, frozen settings',
    '',
    perPolicyTable(cg),
    '',
    '## Per-evening results: first come, first served',
    '',
    perPolicyTable(rep.perPolicy.fcfs),
    '',
    '## Per-evening results: nearest pantry',
    '',
    perPolicyTable(rep.perPolicy.nearest),
    '',
    '## Differences d (Salo minus central greedy)',
    '',
    diffTable(salo, cg, rep.count),
    '',
    '## Spread, s_U and the count',
    '',
    measureLines('Food rescued (gap 6 kg)', food, 'kg', `${GAP_FOOD_KG} kg`, 2),
    measureLines('Worst-served need met (gap 0.10)', fair, 'of need met (fraction)', GAP_FAIR.toFixed(2), 3),
    `**Main-evening count = max(${food.n}, ${fair.n}, ${MIN_MAIN_EVENINGS}) = ${count}.**`,
    '',
    extra,
    '',
    '## Food-ceiling frequency (pilot, 10 evenings per policy)',
    '',
    '| Policy | Evenings at the food ceiling |',
    '|---|---|',
    ...ceilingRows,
    '',
    '## Next',
    '',
    `- The count ${count} is recorded in \`src/results/registration.ts\` with \`pilotDone: true\` before any main run.`,
    '- No main evening was run for this report. The main run is a separate step.',
    '',
  ].join('\n');
}
