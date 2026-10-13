/// <reference types="jest" />
// Independent SPEC tests for reliability(shows, runs) = (shows + 1) / (runs + 2).
// Every expected number below was derived by hand from the spec, not from the code.

import { reliability } from '../reliability';

describe('reliability: (shows+1)/(runs+2)', () => {
  test('R. Dizon 10 shows of 11 runs = 11/13 = 0.846153..., rounds to 0.85', () => {
    const v = reliability(10, 11);
    expect(v).toBeCloseTo(0.846154, 6);
    expect(Math.round(v * 100) / 100).toBe(0.85);
  });

  test('after one withdrawal, 10 shows of 12 runs = 11/14 = 0.785714..., rounds to 0.79', () => {
    const v = reliability(10, 12);
    expect(v).toBeCloseTo(0.785714, 6);
    expect(Math.round(v * 100) / 100).toBe(0.79);
  });

  test('new volunteer with 0 shows and 0 runs = 1/2 = 0.5', () => {
    expect(reliability(0, 0)).toBe(0.5);
  });

  test('0 shows of 5 runs = 1/7 = 0.142857...', () => {
    expect(reliability(0, 5)).toBeCloseTo(0.142857, 6);
  });

  test('3 shows of 4 runs = 4/6 = 0.666666...', () => {
    expect(reliability(3, 4)).toBeCloseTo(0.666667, 6);
  });
});
