/// <reference types="jest" />
// Guide p.15 check: every evening starts from the frozen tuning reliability (the dataset's tuning counts), and nothing
// learned in one evening carries into the next. Tuning evenings only (E01, E02), so no pilot or main row is read here.
import { EVENINGS, WORLD } from '../../data/dataset';
import { FROZEN_PARAMS } from '../../engine/frozenParams';
import { reliability } from '../../engine/reliability';
import { runEvening } from '../../engine/simulate';
import type { PolicyId } from '../../engine/types';
import { indexWorld } from '../../engine/world';
import { assertTuningEvening } from '../objective';

const wx = indexWorld(WORLD);
const tuningEvening = (id: string) => {
  const ev = EVENINGS.find((e) => e.id === id);
  if (!ev) throw new Error(`no evening ${id}`);
  assertTuningEvening(ev);
  return ev;
};
const E01 = tuningEvening('E01');
const E02 = tuningEvening('E02');
const POLICIES: PolicyId[] = ['salo', 'fcfs', 'nearest', 'central_greedy'];

describe('no learning carries from one evening to the next', () => {
  test('an evening gives the same log and result whether or not other evenings ran before it, under every policy', () => {
    for (const policy of POLICIES) {
      const alone = runEvening(wx, E02, { policy, params: FROZEN_PARAMS });
      runEvening(wx, E01, { policy, params: FROZEN_PARAMS });
      runEvening(wx, E01, { policy, params: FROZEN_PARAMS });
      const after = runEvening(wx, E02, { policy, params: FROZEN_PARAMS });
      expect(JSON.stringify(after.log)).toBe(JSON.stringify(alone.log));
      expect(after.result).toEqual(alone.result);
    }
  });

  test('learning is on by default and each evening updates reliability inside itself', () => {
    const out = runEvening(wx, E02, { policy: 'salo', params: FROZEN_PARAMS });
    const updates = out.log.filter((e) => e.event.type === 'RELIABILITY_UPDATED');
    expect(updates.length).toBeGreaterThan(0);
  });

  test('the first estimate each driver shows in an evening is the frozen tuning value, (shows + 1) / (runs + 2)', () => {
    const drivers = new Map(WORLD.drivers.map((d) => [d.id, d]));
    const seen = new Set<string>();
    let checked = 0;
    for (const entry of runEvening(wx, E02, { policy: 'salo', params: FROZEN_PARAMS }).log) {
      const ev = entry.event;
      if (ev.type !== 'MESSAGE' || ev.message.type !== 'PROPOSE' || ev.message.proposer !== 'driver') continue;
      const driverId = ev.message.driverId;
      if (seen.has(driverId)) continue;
      seen.add(driverId);
      const d = drivers.get(driverId)!;
      expect(ev.message.reliability).toBeCloseTo(reliability(d.tuningShows, d.tuningRuns), 12);
      checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
});
