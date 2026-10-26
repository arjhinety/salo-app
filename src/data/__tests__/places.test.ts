import { donorPosition, driverPosition, pantryPosition, ALL_POSITIONS } from '../places';
import { WORLD } from '../dataset';

describe('bundled coordinates (DSH-06, DRV-06)', () => {
  test('every donor, pantry and driver home has a finite position inside Quezon City', () => {
    expect(ALL_POSITIONS).toHaveLength(WORLD.donors.length + WORLD.pantries.length + WORLD.drivers.length);
    for (const p of ALL_POSITIONS) {
      expect(p.lat).toBeGreaterThan(14.5);
      expect(p.lat).toBeLessThan(14.8);
      expect(p.lon).toBeGreaterThan(120.9);
      expect(p.lon).toBeLessThan(121.2);
    }
  });

  test('the values are the CSV values, for three places read straight from the files', () => {
    expect(donorPosition('D01')).toEqual({ lat: 14.621697, lon: 121.050233 });
    expect(pantryPosition('P01')).toEqual({ lat: 14.622694, lon: 121.058242 });
    expect(driverPosition('V01')).toEqual({ lat: 14.629239, lon: 121.045226 });
  });

  test('an unknown id has no position', () => {
    expect(donorPosition('D99')).toBeUndefined();
  });
});
