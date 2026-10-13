/// <reference types="jest" />
// Independent SPEC tests for u01(seed, stream, a, b, c?) and intBelow(n, seed, stream, a, b, c?).

import { u01, intBelow } from '../rng';

describe('u01', () => {
  test('values are in [0, 1)', () => {
    for (let a = 0; a < 1000; a++) {
      const v = u01(11, 2, a, 7);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  test('deterministic for the same keys', () => {
    expect(u01(42, 1, 2, 3)).toBe(u01(42, 1, 2, 3));
    expect(u01(42, 1, 2, 3, 4)).toBe(u01(42, 1, 2, 3, 4));
  });

  test('changing any single key changes the value', () => {
    const base = u01(42, 1, 2, 3);
    expect(u01(43, 1, 2, 3)).not.toBe(base); // seed
    expect(u01(42, 2, 2, 3)).not.toBe(base); // stream
    expect(u01(42, 1, 3, 3)).not.toBe(base); // a
    expect(u01(42, 1, 2, 4)).not.toBe(base); // b
  });

  test('changing the optional c key changes the value', () => {
    expect(u01(42, 1, 2, 3, 4)).not.toBe(u01(42, 1, 2, 3, 5));
  });

  test('key order matters: u01(s,1,2,3) differs from u01(s,1,3,2)', () => {
    expect(u01(42, 1, 2, 3)).not.toBe(u01(42, 1, 3, 2));
  });

  test('rough uniformity: mean of 10,000 draws over a in 0..9999 is within 0.48-0.52', () => {
    let sum = 0;
    for (let a = 0; a < 10000; a++) {
      sum += u01(7, 1, a, 0);
    }
    const mean = sum / 10000;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});

describe('intBelow', () => {
  test('intBelow(6, ...) only returns integers 0..5 and hits all six values over 1,000 draws', () => {
    const seen = new Set<number>();
    for (let a = 0; a < 1000; a++) {
      const v = intBelow(6, 5, 1, a, 0);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
    expect([...seen].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  test('deterministic for the same keys', () => {
    expect(intBelow(6, 5, 1, 2, 3)).toBe(intBelow(6, 5, 1, 2, 3));
  });
});
