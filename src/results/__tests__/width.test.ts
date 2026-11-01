/// <reference types="jest" />
// The width check (Arjhine, decisions.md M6): the full width of each main 97.5% interval against its gap. Hand-worked.
import { widthCheck, WIDTH_GAP_FOOD_KG, WIDTH_GAP_NEED_MET } from '../width';

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
