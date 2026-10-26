import { WORLD } from '../../data/dataset';
import { driverTrack, estimateText } from '../drivers';
import { dash } from '../../i18n/strings';
import type { Driver } from '../../engine/types';

const driver = (over: Partial<Driver>): Driver => ({
  id: 'V99',
  name: 'Test',
  vehicle: 'motorcycle',
  capacityLoadUnits: 5,
  street: 'Test Street',
  availableFromMinute: 1020,
  availableToMinute: 1260,
  tuningRuns: 0,
  tuningShows: 0,
  frozenReliability: 0.5,
  anchor: false,
  ...over,
});

describe('driver reliability (DSH-07)', () => {
  test('0 of 0 runs gives 0.50 and reads as a new volunteer', () => {
    const t = driverTrack(driver({ tuningRuns: 0, tuningShows: 0 }));
    expect(t.estimate).toBe(0.5);
    expect(t.newVolunteer).toBe(true);
    expect(dash.newVolunteer(estimateText(t.estimate))).toBe('New volunteer, no history yet (estimate 0.50)');
  });

  test('10 of 11 runs gives 0.85', () => {
    const t = driverTrack(driver({ tuningRuns: 11, tuningShows: 10 }));
    expect(estimateText(t.estimate)).toBe('0.85');
    expect(dash.track(t.shows, t.runs, estimateText(t.estimate))).toBe('Showed up 10 of 11 runs (estimate 0.85)');
  });

  test('10 of 12 runs gives 0.79', () => {
    expect(estimateText(driverTrack(driver({ tuningRuns: 12, tuningShows: 10 })).estimate)).toBe('0.79');
  });

  test('R. Dizon in the bundled dataset reads as in the story', () => {
    const r = WORLD.drivers.find((d) => d.id === 'V01');
    if (!r) throw new Error('V01 missing');
    const t = driverTrack(r);
    expect(t.newVolunteer).toBe(false);
    expect(dash.track(t.shows, t.runs, estimateText(t.estimate))).toBe('Showed up 10 of 11 runs (estimate 0.85)');
  });

  test('every bundled driver shows the frozen tuning estimate at two decimals', () => {
    const mismatches = WORLD.drivers
      .filter((d) => estimateText(driverTrack(d).estimate) !== d.frozenReliability.toFixed(2))
      .map((d) => d.id);
    expect(mismatches).toEqual([]);
    expect(WORLD.drivers).toHaveLength(40);
  });
});
