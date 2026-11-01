/// <reference types="node" />
/// <reference types="jest" />
// Food ceiling under both definitions (RES-07; guide p.13 asks for the frequency of the ceiling, the guide's text is quoted in
// docs/reports/m6-main.md section 7). Runs only when M6_CEILING=1. Counts only: tuning (E01-E10) and pilot (E11-E20) for
// the ceiling, which guide p.13 allows; main (E21-E64) from the stored record. Frozen parameters, learning on.
// Writes section 7 of docs/reports/m6-main.md (replacing an earlier section 7). Nothing else in the report changes.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENINGS, WORLD } from '../../data/dataset';
import { FROZEN_PARAMS } from '../../engine/frozenParams';
import { POLICY_IDS } from '../../engine/policies';
import { runEvening } from '../../engine/simulate';
import type { Evening, EveningResult, PolicyId } from '../../engine/types';
import { indexWorld } from '../../engine/world';
import { ceilingCounts, postedCeilingCounts, postedKgOf } from '../../results/learning';
import { REGISTRATION } from '../../results/registration';
import { mainEvenings } from '../../results/runner';
import { loadRecord } from '../../results/__tests__/recordFixture';
import { CEILING_SECTION_HEADING, renderCeilingSection, supplyRatios, type CeilingGroup } from '../mainRender';

const run = process.env.M6_CEILING === '1' ? it : it.skip;
const ROOT = join(__dirname, '..', '..', '..');
const REPORT = join(ROOT, 'docs', 'reports', 'm6-main.md');

const runsOf = (evenings: readonly Evening[]): Record<PolicyId, EveningResult[]> => {
  const wx = indexWorld(WORLD);
  const out = {} as Record<PolicyId, EveningResult[]>;
  for (const policy of POLICY_IDS) {
    out[policy] = evenings.map((e) => runEvening(wx, e, { policy, params: FROZEN_PARAMS }).result);
  }
  return out;
};

/** Each run's food rescued and food wasted add up to the evening's posted kg (the engine's own total). */
function checkPosted(runs: Record<PolicyId, readonly EveningResult[]>, evenings: readonly Evening[]) {
  for (const policy of POLICY_IDS) {
    runs[policy].forEach((r, i) => {
      expect(r.evening).toBe(evenings[i].id);
      expect(Math.abs(r.foodRescuedKg + r.foodWastedKg - postedKgOf(evenings[i]))).toBeLessThan(1e-9);
    });
  }
}

run('food ceiling under both definitions: tuning, pilot and main (gated by M6_CEILING=1)', () => {
  const started = Date.now();
  const tuning = EVENINGS.filter((e) => e.split === 'tuning');
  const pilot = EVENINGS.filter((e) => e.split === 'pilot');
  const main = mainEvenings(EVENINGS);
  expect(tuning.map((e) => e.id)).toEqual(Array.from({ length: 10 }, (_, i) => `E${String(1 + i).padStart(2, '0')}`));
  expect(pilot.map((e) => e.id)).toEqual(Array.from({ length: 10 }, (_, i) => `E${11 + i}`));
  expect(main.map((e) => e.id)).toEqual(Array.from({ length: 44 }, (_, i) => `E${21 + i}`));

  const groups: CeilingGroup[] = [];
  const addGroup = (label: string, evenings: readonly Evening[], runs: Record<PolicyId, readonly EveningResult[]>) => {
    checkPosted(runs, evenings);
    const ratios = supplyRatios(evenings);
    groups.push({
      label,
      evenings: evenings.length,
      firstDefinition: ceilingCounts(runs, evenings, REGISTRATION),
      secondDefinition: postedCeilingCounts(runs, evenings, REGISTRATION),
      supply: { min: ratios.min, max: ratios.max },
    });
  };

  addGroup('Tuning E01–E10 (in-sample)', tuning, runsOf(tuning));
  addGroup('Pilot E11–E20', pilot, runsOf(pilot));
  // The main evenings come from the stored record: its per-evening runs are the numbers the report uses.
  const record = loadRecord();
  addGroup('Main E21–E64', main, record.main.perEvening);

  const closest = Object.fromEntries(
    POLICY_IDS.map((p) => [p, Math.min(...record.main.perEvening[p].map((r) => r.foodWastedKg))]),
  ) as Record<PolicyId, number>;
  const section = renderCeilingSection(groups, closest);

  const body = readFileSync(REPORT, 'utf8');
  const at = body.indexOf(CEILING_SECTION_HEADING);
  const head = at >= 0 ? body.slice(0, at) : `${body.replace(/\s*$/, '')}\n\n`;
  writeFileSync(REPORT, head + section);

  const seconds = (Date.now() - started) / 1000;
  process.stdout.write(
    `ceiling: ${groups.map((g) => `${g.label} first ${JSON.stringify(g.firstDefinition)} second ${JSON.stringify(g.secondDefinition)}`).join('; ')}; ` +
      `${seconds.toFixed(1)} s; section 7 written\n`,
  );
}, 60 * 60 * 1000);
