/**
 * Which drivers of an evening can be held on this phone: those who receive at least one request (decision D-Q5).
 *
 * Why one run is enough: a held driver is asked in exactly the rounds where the same driver would make a PROPOSE in
 * the all-simulated run, and the two runs are identical up to the first such round (a held driver is only different
 * from the moment it would have proposed). So "at least one request" is "at least one driver PROPOSE in the baseline".
 * The test in src/driver/__tests__/chooser.test.ts checks this against a held run per driver.
 */
import { EVENINGS, WORLD } from '../data/dataset';
import { UNTUNED_PARAMS } from '../engine/params';
import { runEvening } from '../engine/simulate';
import type { Driver, Evening, EveningId } from '../engine/types';
import { indexWorld } from '../engine/world';

const WX = indexWorld(WORLD);
const memo = new Map<EveningId, readonly Driver[]>();

/** The drivers of this evening who receive at least one request, in dataset order. Memoized per evening. */
export function requestDrivers(evening: Evening): readonly Driver[] {
  const hit = memo.get(evening.id);
  if (hit) return hit;
  const run = runEvening(WX, evening, { policy: 'salo', params: UNTUNED_PARAMS, inputs: [] });
  const proposers = new Set<string>();
  for (const e of run.log) {
    if (e.event.type === 'MESSAGE' && e.event.message.type === 'PROPOSE' && e.event.message.proposer === 'driver') {
      proposers.add(e.event.message.driverId);
    }
  }
  const list = WORLD.drivers.filter((d) => proposers.has(d.id));
  memo.set(evening.id, list);
  return list;
}

/** The tuning evening the live demo plays (E05). */
export function demoEvening(): Evening {
  const ev = EVENINGS.find((e) => e.id === 'E05');
  if (!ev) throw new Error('no evening E05');
  return ev;
}
