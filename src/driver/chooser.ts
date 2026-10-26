/**
 * The driver chooser (DRV-01): which drivers of an evening this phone can hold, and in what order.
 *
 * Who is listed: the drivers who receive at least one request (decision D-Q5). Why one run is enough: a held driver is
 * asked in exactly the rounds where the same driver would make a PROPOSE in the all-simulated run, and the two runs are
 * identical up to the first such round. So "at least one request" is "at least one driver PROPOSE in the baseline". The
 * test in src/driver/__tests__/chooser.test.ts checks this against a held run per driver.
 *
 * Order: the drivers who win at least one delivery in the no-hold baseline come first, most COMMITs first, then id. The
 * rest follow in dataset order. The first entry is the default. No id is written in code: all of it is read from the run.
 *
 * Lock: the chooser changes the held driver, which re-runs the evening. After 17:00, or while the clock runs, a change
 * would rewrite what has already happened, so the chooser is locked (see chooserLocked).
 */
import { EVENINGS, WORLD } from '../data/dataset';
import { SIM_START_MINUTE } from '../live/evening';
import { UNTUNED_PARAMS } from '../engine/params';
import { runEvening } from '../engine/simulate';
import type { Driver, Evening, EveningId } from '../engine/types';
import { indexWorld } from '../engine/world';

const WX = indexWorld(WORLD);

interface Baseline {
  /** Drivers who receive at least one request, in dataset order. */
  requested: readonly Driver[];
  /** Number of COMMITs per driver id in the baseline run (drivers with no COMMIT are absent). */
  commits: ReadonlyMap<string, number>;
}

const memo = new Map<EveningId, Baseline>();

function baseline(evening: Evening): Baseline {
  const hit = memo.get(evening.id);
  if (hit) return hit;
  const run = runEvening(WX, evening, { policy: 'salo', params: UNTUNED_PARAMS, inputs: [] });
  const proposers = new Set<string>();
  const commits = new Map<string, number>();
  for (const e of run.log) {
    if (e.event.type === 'MESSAGE' && e.event.message.type === 'PROPOSE' && e.event.message.proposer === 'driver') {
      proposers.add(e.event.message.driverId);
    }
    if (e.event.type === 'MESSAGE' && e.event.message.type === 'COMMIT') {
      const id = e.event.message.driverId;
      commits.set(id, (commits.get(id) ?? 0) + 1);
    }
  }
  const out: Baseline = { requested: WORLD.drivers.filter((d) => proposers.has(d.id)), commits };
  memo.set(evening.id, out);
  return out;
}

/** The drivers of this evening who receive at least one request, in dataset order. Memoized per evening. */
export function requestDrivers(evening: Evening): readonly Driver[] {
  return baseline(evening).requested;
}

/**
 * The chooser's list: winners of the no-hold baseline first (most COMMITs, then id), then the other requested drivers in
 * dataset order. Index 0 is the default driver.
 */
export function chooserOrder(evening: Evening): readonly Driver[] {
  const { requested, commits } = baseline(evening);
  const won = (id: string) => commits.get(id) ?? 0;
  const winners = requested
    .filter((d) => won(d.id) > 0)
    .sort((a, b) => won(b.id) - won(a.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const winnerIds = new Set(winners.map((d) => d.id));
  return [...winners, ...requested.filter((d) => !winnerIds.has(d.id))];
}

/**
 * True when the held driver may not change: the clock is past 17:00 or it is running. Changing the driver then re-runs
 * an evening that has already happened in part, so the chooser stays disabled until the clock is rewound to 17:00 and
 * paused.
 */
export function chooserLocked(snapshot: { minute: number; running: boolean }): boolean {
  return snapshot.running || snapshot.minute > SIM_START_MINUTE;
}

/** The tuning evening the live demo plays (E05). */
export function demoEvening(): Evening {
  const ev = EVENINGS.find((e) => e.id === 'E05');
  if (!ev) throw new Error('no evening E05');
  return ev;
}
