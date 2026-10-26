/**
 * The driver chooser (DRV-01): the drivers of E05 who receive at least one request. Checked against a held run per
 * driver, because the list is built from one all-simulated run (see src/driver/chooser.ts).
 */
import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../../engine/params';
import { runEvening } from '../../engine/simulate';
import { indexWorld } from '../../engine/world';
import { driverBoard } from '../board';
import { demoEvening, requestDrivers } from '../chooser';

const WX = indexWorld(WORLD);
const E05 = EVENINGS.find((e) => e.id === 'E05')!;
const LOTS = new Map(E05.lots.map((l) => [l.id, l]));

describe('requestDrivers on E05', () => {
  it('is the demo evening', () => {
    expect(demoEvening().id).toBe('E05');
  });

  it('lists all 40 drivers in dataset order, so the default is V01', () => {
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
