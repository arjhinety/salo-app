import { enUnit } from '../pantry';

describe('English units follow the quantity', () => {
  it('singular for one, plural for everything else', () => {
    expect(enUnit('tray', 1)).toBe('tray');
    expect(enUnit('tray', 3)).toBe('trays');
    expect(enUnit('piece', 1)).toBe('piece');
    expect(enUnit('piece', 20)).toBe('pieces');
  });

  it('units without a plural stay the same, and an unknown unit is returned as it is', () => {
    expect(enUnit('kg', 1)).toBe('kg');
    expect(enUnit('kg', 6)).toBe('kg');
    expect(enUnit('mystery', 1)).toBe('mystery');
  });
});
