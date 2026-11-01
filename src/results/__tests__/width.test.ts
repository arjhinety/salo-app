/// <reference types="jest" />
// The width check (Arjhine, decisions.md M6): the full width of each main 97.5% interval against its gap. Hand-worked.
import { insideGap, widthCheck, WIDTH_GAP_FOOD_KG, WIDTH_GAP_NEED_MET } from '../width';

describe('widthCheck', () => {
  test('the gaps are 6 kg of food and 0.10 of worst-served need met', () => {
    expect(WIDTH_GAP_FOOD_KG).toBe(6);
    expect(WIDTH_GAP_NEED_MET).toBe(0.1);
  });

  test('food: [-2, 4] is 6 kg wide, which is not below 6 kg (strict)', () => {
    expect(widthCheck({ main: true, measure: 'foodRescued', low: -2, high: 4 })).toEqual({ width: 6, gap: 6, below: false });
  });

  test('food: [-2, 3.99] is 5.99 kg wide, below 6 kg', () => {
    const w = widthCheck({ main: true, measure: 'foodRescued', low: -2, high: 3.99 });
    expect(w.width).toBeCloseTo(5.99, 12);
    expect(w.below).toBe(true);
  });

  test('need met: [0, 0.1] is 0.10 wide, which is not below 0.10 (strict)', () => {
    expect(widthCheck({ main: true, measure: 'needMet', low: 0, high: 0.1 })).toEqual({ width: 0.1, gap: 0.1, below: false });
  });

  test('need met: [-0.026, 0.053] is 0.079 wide, below 0.10', () => {
    const w = widthCheck({ main: true, measure: 'needMet', low: -0.026, high: 0.053 });
    expect(w.width).toBeCloseTo(0.079, 12);
    expect(w.below).toBe(true);
  });

  test('a supporting comparison is refused: the check is for the two main results only', () => {
    expect(() => widthCheck({ main: false, measure: 'foodRescued', low: 0, high: 1 })).toThrow('the two main results only');
  });

  test('a measure without a gap is refused', () => {
    expect(() => widthCheck({ main: true, measure: 'stranded', low: 0, high: 1 })).toThrow('no width gap for stranded');
  });
});

describe('insideGap (post-hoc supporting reading, not a pre-registered equivalence test)', () => {
  test('the recorded main food interval [-2.78, +1.79] lies inside plus or minus 6 kg', () => {
    expect(insideGap({ main: true, measure: 'foodRescued', low: -2.78, high: 1.79 })).toBe(true);
  });
  test('the recorded fairness interval [-0.026, +0.053] lies inside plus or minus 0.10', () => {
    expect(insideGap({ main: true, measure: 'needMet', low: -0.026, high: 0.053 })).toBe(true);
  });
  test('an interval touching the gap is not inside (strict): food [-6, 1] and fairness [-0.02, 0.1]', () => {
    expect(insideGap({ main: true, measure: 'foodRescued', low: -6, high: 1 })).toBe(false);
    expect(insideGap({ main: true, measure: 'needMet', low: -0.02, high: 0.1 })).toBe(false);
  });
  test('a narrow interval shifted outside the gap is not inside: food [5, 7]', () => {
    expect(insideGap({ main: true, measure: 'foodRescued', low: 5, high: 7 })).toBe(false);
  });
});
