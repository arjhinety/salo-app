/// <reference types="jest" />
// Independent SPEC tests for shareBid(value, scale, sharesLeft) = min(sharesLeft, round(scale * value)), never below 0.
// Expected numbers derived by hand:
//   17 * 0.82 = 13.94 -> round 14
//   17 * 0.61 = 10.37 -> round 10

import { shareBid } from '../shares';

describe('shareBid: min(sharesLeft, round(scale * value)), never below 0', () => {
  test('Bukal value 0.82, scale 17, plenty of shares -> 14', () => {
    expect(shareBid(0.82, 17, 20)).toBe(14);
  });

  test('Socorro value 0.61, scale 17, plenty of shares -> 10', () => {
    expect(shareBid(0.61, 17, 20)).toBe(10);
  });

  test('cap: value 0.82, scale 17, sharesLeft 5 -> 5', () => {
    expect(shareBid(0.82, 17, 5)).toBe(5);
  });

  test('sharesLeft 0 -> 0', () => {
    expect(shareBid(0.82, 17, 0)).toBe(0);
  });

  test('value 0 -> 0', () => {
    expect(shareBid(0, 17, 20)).toBe(0);
  });

  test('never below 0: negative sharesLeft -> 0', () => {
    expect(shareBid(0.82, 17, -3)).toBe(0);
  });
});
