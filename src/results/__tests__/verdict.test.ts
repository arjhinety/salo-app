/// <reference types="jest" />
// RES-04: the verdict rule with its three literal fixtures (a), (b), (c), plus the central-greedy case.

import { verdictLine, verdictOf, VERDICT_LABEL } from '../verdict';

describe('verdictOf (RES-04 fixtures)', () => {
  test('(a) food rescued [+2, +8] and worst-served [-0.01, +0.20] give "Salo better"', () => {
    const v = verdictOf({ low: 2, high: 8 }, { low: -0.01, high: 0.2 });
    expect(v).toBe('salo_better');
    expect(VERDICT_LABEL[v]).toBe('Salo better');
  });

  test('(b) food rescued [-5, -1] and worst-served [+0.10, +0.20] give "Trade-off"', () => {
    const v = verdictOf({ low: -5, high: -1 }, { low: 0.1, high: 0.2 });
    expect(v).toBe('trade_off');
    expect(VERDICT_LABEL[v]).toBe('Trade-off');
  });

  test('(c) food rescued [-1, +3] and worst-served [-0.05, +0.05] give "No clear difference"', () => {
    const v = verdictOf({ low: -1, high: 3 }, { low: -0.05, high: 0.05 });
    expect(v).toBe('no_clear_difference');
    expect(VERDICT_LABEL[v]).toBe('No clear difference');
  });

  test('central greedy clearly ahead on food, and Salo not ahead on fairness: "Central greedy better"', () => {
    const v = verdictOf({ low: -4, high: -0.5 }, { low: -0.02, high: 0.03 });
    expect(v).toBe('central_greedy_better');
    expect(VERDICT_LABEL[v]).toBe('Central greedy better');
  });

  test('an interval that only touches zero does not count as clearly favouring anyone', () => {
    expect(verdictOf({ low: 0, high: 2 }, { low: -1, high: 1 })).toBe('no_clear_difference');
  });
});

describe('verdictLine', () => {
  test('shows the label and both intervals it used', () => {
    const line = verdictLine({ low: 2, high: 8 }, { low: -0.01, high: 0.2 });
    expect(line.startsWith('Salo better:')).toBe(true);
    expect(line).toContain('food rescued [+2.00, +8.00] kg per evening');
    expect(line).toContain('worst-served need met [−0.01, +0.20]');
  });
});
