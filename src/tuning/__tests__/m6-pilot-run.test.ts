/// <reference types="node" />
/// <reference types="jest" />
// M6 pilot runner (milestone M6 step 2). Runs only when M6_PILOT=1 (skipped in normal test runs, like m6-tuning-run.test.ts).
// Pilot evenings E11-E20 only: assertPilotEvenings refuses anything else. Main evenings (E21-E30) are not selected, read
// or counted here. The frozen settings only (FROZEN_PARAMS, never UNTUNED_PARAMS), learning on, the four policies.
// No bootstrap interval and no verdict is computed: the pilot only sets the main-evening count.
// Writes docs/reports/m6-pilot.md. Sequential, one evening at a time.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVENINGS, WORLD } from '../../data/dataset';
import { FROZEN_PARAMS } from '../../engine/frozenParams';
import { POLICY_IDS } from '../../engine/policies';
import type { PolicyId } from '../../engine/types';
import { indexWorld } from '../../engine/world';
import { checksumParams, REGISTRATION } from '../../results/registration';
import { assertPilotEvenings, PILOT_EVENING_IDS, pilotCount } from '../pilotCount';
import { renderPilotReport } from '../pilotRender';
import { measureEvening, type EveningDetail } from '../run';

const run = process.env.M6_PILOT === '1' ? it : it.skip;
const ROOT = join(__dirname, '..', '..', '..');
const REPORT_DIR = join(ROOT, 'docs', 'reports');

run('M6 pilot on E11-E20 (gated by M6_PILOT=1)', () => {
  // Filter strictly by split, then assert the exact list (E11..E20, every one a pilot evening).
  const evenings = EVENINGS.filter((e) => e.split === 'pilot');
  assertPilotEvenings(evenings);
  expect(evenings.map((e) => e.id)).toEqual([...PILOT_EVENING_IDS]);

  // The frozen settings the registration records (never the untuned starting values).
  const checksum = checksumParams(FROZEN_PARAMS);
  expect(checksum).toBe(REGISTRATION.frozenParamsChecksum);
  expect(FROZEN_PARAMS.frozenOn).not.toBe('UNTUNED');

  const wx = indexWorld(WORLD);
  const perPolicy = {} as Record<PolicyId, EveningDetail[]>;
  for (const policy of POLICY_IDS) {
    perPolicy[policy] = evenings.map((ev) => measureEvening(wx, ev, policy, FROZEN_PARAMS));
    expect(perPolicy[policy].map((d) => d.evening)).toEqual([...PILOT_EVENING_IDS]);
  }

  // d = Salo minus central greedy, evening by evening. A null worst-served value would make d undefined: refuse it.
  const salo = perPolicy.salo;
  const cg = perPolicy.central_greedy;
  const dFood = salo.map((s, i) => s.foodKg - cg[i].foodKg);
  const dFair = salo.map((s, i) => {
    const a = s.worstNeedMet;
    const b = cg[i].worstNeedMet;
    if (a === null || b === null) throw new Error(`${s.evening}: no worst-served value for a policy, so d_fair is undefined`);
    return a - b;
  });
  const count = pilotCount(dFood, dFair);

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(
    join(REPORT_DIR, 'm6-pilot.md'),
    renderPilotReport({ date: '2026-11-01', checksum, perPolicy, count }),
  );

  // Once the count is recorded in registration.ts, a re-run must reproduce it.
  if (REGISTRATION.mainEveningCount !== null) expect(count.count).toBe(REGISTRATION.mainEveningCount);
  process.stdout.write(
    `pilot: n_food ${count.food.n}, n_fair ${count.fair.n}, count ${count.count}; report written\n`,
  );
}, 60 * 60 * 1000);
