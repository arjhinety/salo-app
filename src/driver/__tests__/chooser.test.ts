/**
 * The driver chooser (DRV-01): the drivers of E05 who receive at least one request. Checked against a held run per
 * driver, because the list is built from one all-simulated run (see src/driver/chooser.ts).
 */
import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../../engine/params';
import { runEvening } from '../../engine/simulate';
import { indexWorld } from '../../engine/world';
import { driverBoard } from '../board';
import { chooserLocked, chooserOrder, demoEvening, requestDrivers } from '../chooser';

const WX = indexWorld(WORLD);
const E05 = EVENINGS.find((e) => e.id === 'E05')!;
const LOTS = new Map(E05.lots.map((l) => [l.id, l]));

describe('requestDrivers on E05', () => {
  it('is the demo evening', () => {
    expect(demoEvening().id).toBe('E05');
  });

  it('lists all 40 drivers in dataset order (chooserOrder reorders them by wins)', () => {
    const ids = requestDrivers(E05).map((d) => d.id);
    expect(ids).toHaveLength(40);
    expect(ids.slice(0, 5)).toEqual(['V01', 'V02', 'V03', 'V04', 'V05']);
    expect(ids[39]).toBe('V40');
  });

  it('agrees with a held run per driver: a driver is listed exactly when the engine asks them at least once', () => {
    const listed = new Set(requestDrivers(E05).map((d) => d.id));
    const askCounts = new Map<string, number>();
    for (const d of WORLD.drivers) {
      const run = runEvening(WX, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: new Set([d.id]), inputs: [] });
      const board = driverBoard({ log: run.log, driver: d, wx: WX, lots: LOTS, now: 99999 });
      askCounts.set(d.id, board.asks.length);
    }
    const askedDrivers = WORLD.drivers.filter((d) => (askCounts.get(d.id) ?? 0) > 0).map((d) => d.id);
    expect(askedDrivers).toEqual([...listed]);
    expect(askCounts.get('V01')).toBe(40);
    expect(askCounts.get('V07')).toBe(23);
    expect(askCounts.get('V30')).toBe(25);
  }, 60000);
});

describe('chooserOrder on E05: winners of the no-hold baseline first', () => {
  // Independent of the chooser: the COMMIT counts are read straight from one baseline run.
  const baselineCommits = () => {
    const run = runEvening(WX, E05, { policy: 'salo', params: UNTUNED_PARAMS, inputs: [] });
    const counts = new Map<string, number>();
    for (const e of run.log) {
      if (e.event.type === 'MESSAGE' && e.event.message.type === 'COMMIT') {
        const id = e.event.message.driverId;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    return counts;
  };

  it('lists the winners by COMMIT count (most first), then by id, then the other requested drivers in dataset order', () => {
    const counts = baselineCommits();
    const winners = WORLD.drivers
      .filter((d) => (counts.get(d.id) ?? 0) > 0)
      .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || (a.id < b.id ? -1 : 1))
      .map((d) => d.id);
    const rest = requestDrivers(E05).map((d) => d.id).filter((id) => !winners.includes(id));

    const ids = chooserOrder(E05).map((d) => d.id);
    expect(ids).toEqual([...winners, ...rest]);
    expect(ids).toHaveLength(40);
    expect(winners.length).toBeGreaterThan(0);
  });

  it('the default is the top winner, found from the run and not written in code', () => {
    const counts = baselineCommits();
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
    expect(chooserOrder(E05)[0].id).toBe(top[0]);
    expect(counts.get(chooserOrder(E05)[0].id)).toBe(top[1]);
    // Five COMMITs in the baseline: L0227, L0245, L0211, L0228, L0214. (The "3 wins" in the architect handoff is a
    // different scenario, V19 offering at its round minute on every round, not this baseline.)
    expect(top).toEqual(['V19', 5]);
  });

  it('the default is not V01, which never wins a round when it offers at its round minute', () => {
    expect(chooserOrder(E05)[0].id).not.toBe('V01');
  });
});

describe('chooserLocked: the driver cannot change after 17:00 or while the clock runs', () => {
  it('is open at 17:00 while paused, locked while running, and locked after 17:00', () => {
    expect(chooserLocked({ minute: 17 * 60, running: false })).toBe(false);
    expect(chooserLocked({ minute: 17 * 60, running: true })).toBe(true);
    expect(chooserLocked({ minute: 17 * 60 + 1, running: false })).toBe(true);
    expect(chooserLocked({ minute: 19 * 60 + 30, running: false })).toBe(true);
  });
});
