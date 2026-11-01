/// <reference types="jest" />
// One unit system for the Results screen: the verdict, the rows and the post-hoc note format through units.ts.

import { kgInterval, kgValue, pointsInterval, pointsValue, signed } from '../units';
import { WIDTH_GAP_FOOD_KG, WIDTH_GAP_NEED_MET } from '../width';
import { RESULTS_COPY as C } from '../copy';

describe('units.ts', () => {
  test('signed values use the true minus sign and the given digits', () => {
    expect(signed(-2.78, 1)).toBe('−2.8');
    expect(signed(1.79, 1)).toBe('+1.8');
    expect(signed(0, 1)).toBe('+0.0');
  });

  test('food is kg to one decimal; need met is points (the fraction times 100) to one decimal', () => {
    expect(kgValue(-2.78)).toBe('−2.8');
    expect(pointsValue(-0.026)).toBe('−2.6');
    expect(pointsValue(0.053)).toBe('+5.3');
  });

  test('the two interval forms the screen writes', () => {
    expect(kgInterval(-2.78, 1.79)).toBe('[−2.8, +1.8] kg');
    expect(pointsInterval(-0.026, 0.053)).toBe('[−2.6, +5.3] points');
  });
});

describe('the post-hoc note states the gaps in the same units', () => {
  test('±6 kg and ±10 points, from the width constants', () => {
    expect(C.insideGapsNote).toContain(`±${WIDTH_GAP_FOOD_KG} kg and ±${Math.round(WIDTH_GAP_NEED_MET * 100)} points`);
  });

  test('it starts with the post-hoc label, and says it is not a pre-registered equivalence test', () => {
    expect(C.insideGapsNote.startsWith('Post-hoc check, not pre-registered:')).toBe(true);
    expect(C.insideGapsNote).toContain('This is not a pre-registered equivalence test.');
  });
});
