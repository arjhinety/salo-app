import { pickupMinute, toDraft, validateResponse } from '../validate';
import type { ParseResponse } from '../types';

/** The architecture 5.1 success example. */
const EXAMPLE = {
  items: [
    { food_item: 'adobo', quantity: 3, unit: 'tray' },
    { food_item: 'pandesal', quantity: 20, unit: 'piece' },
  ],
  pickup_by: '20:00',
  missing: [],
  source: 'llm',
  model: 'claude-haiku-5-5',
};

const withItems = (items: unknown[]) => ({ ...EXAMPLE, items });

describe('validateResponse (architecture 5.3)', () => {
  it('accepts the architecture example and keeps its fields', () => {
    expect(validateResponse(EXAMPLE)).toEqual({
      items: [
        { food_item: 'adobo', quantity: 3, unit: 'tray' },
        { food_item: 'pandesal', quantity: 20, unit: 'piece' },
      ],
      pickup_by: '20:00',
      missing: [],
      source: 'llm',
      model: 'claude-haiku-5-5',
    });
  });

  it('rejects 11 items (at most 10)', () => {
    const eleven = Array.from({ length: 11 }, () => ({ food_item: 'menudo', quantity: 1, unit: 'tray' }));
    expect(validateResponse(withItems(eleven))).toBeNull();
  });

  it('rejects an empty items array', () => {
    expect(validateResponse(withItems([]))).toBeNull();
  });

  it('rejects items that are not an array', () => {
    expect(validateResponse({ ...EXAMPLE, items: 'adobo' })).toBeNull();
    expect(validateResponse({ ...EXAMPLE, items: { food_item: 'adobo' } })).toBeNull();
  });

  it('rejects quantity 0', () => {
    expect(validateResponse(withItems([{ food_item: 'adobo', quantity: 0, unit: 'tray' }]))).toBeNull();
  });

  it('rejects quantity 501 and accepts 500', () => {
    expect(validateResponse(withItems([{ food_item: 'adobo', quantity: 501, unit: 'tray' }]))).toBeNull();
    expect(validateResponse(withItems([{ food_item: 'adobo', quantity: 500, unit: 'tray' }]))).not.toBeNull();
  });

  it('rejects a non-finite quantity', () => {
    expect(validateResponse(withItems([{ food_item: 'adobo', quantity: Number.NaN, unit: 'tray' }]))).toBeNull();
    expect(validateResponse(withItems([{ food_item: 'adobo', quantity: '3', unit: 'tray' }]))).toBeNull();
  });

  it('rejects pickup_by 23:00 (window is 16:00 to 22:00)', () => {
    expect(validateResponse({ ...EXAMPLE, pickup_by: '23:00' })).toBeNull();
    expect(validateResponse({ ...EXAMPLE, pickup_by: '15:59' })).toBeNull();
    expect(validateResponse({ ...EXAMPLE, pickup_by: '16:00' })).not.toBeNull();
    expect(validateResponse({ ...EXAMPLE, pickup_by: '22:00' })).not.toBeNull();
  });

  it('accepts pickup_by null and rejects a malformed time', () => {
    expect(validateResponse({ ...EXAMPLE, pickup_by: null })?.pickup_by).toBeNull();
    expect(validateResponse({ ...EXAMPLE, pickup_by: '8:00' })).toBeNull();
    expect(validateResponse({ ...EXAMPLE, pickup_by: '20:60' })).toBeNull();
  });

  it('rejects unit "box" and accepts the mapped Filipino unit words', () => {
    expect(validateResponse(withItems([{ food_item: 'adobo', quantity: 1, unit: 'box' }]))).toBeNull();
    const piraso = validateResponse(withItems([{ food_item: 'pandesal', quantity: 5, unit: 'piraso' }]));
    expect(piraso?.items[0].unit).toBe('piece');
    const kilos = validateResponse(withItems([{ food_item: 'tomatoes', quantity: 2, unit: 'kilos' }]));
    expect(kilos?.items[0].unit).toBe('kg');
    expect(validateResponse(withItems([{ food_item: 'menudo', quantity: 1, unit: null }]))?.items[0].unit).toBeNull();
  });

  it('rejects an empty food_item', () => {
    expect(validateResponse(withItems([{ food_item: '', quantity: 1, unit: 'tray' }]))).toBeNull();
    expect(validateResponse(withItems([{ food_item: '   ', quantity: 1, unit: 'tray' }]))).toBeNull();
  });

  it('rejects a 61-character food_item and accepts one of 60', () => {
    expect(validateResponse(withItems([{ food_item: 'a'.repeat(61), quantity: 1, unit: 'tray' }]))).toBeNull();
    expect(validateResponse(withItems([{ food_item: 'a'.repeat(60), quantity: 1, unit: 'tray' }]))).not.toBeNull();
  });

  it('drops unknown fields', () => {
    const out = validateResponse({
      ...EXAMPLE,
      confidence: 0.9,
      items: [{ food_item: 'adobo', quantity: 3, unit: 'tray', color: 'red' }],
    });
    expect(out).not.toBeNull();
    expect(out).not.toHaveProperty('confidence');
    expect(out?.items[0]).toEqual({ food_item: 'adobo', quantity: 3, unit: 'tray' });
  });

  it('rejects a non-object body and a source other than llm', () => {
    expect(validateResponse(null)).toBeNull();
    expect(validateResponse([EXAMPLE])).toBeNull();
    expect(validateResponse({ ...EXAMPLE, source: 'fallback' })).toBeNull();
  });
});

describe('toDraft', () => {
  it('matches canonical names and flags the unmatched adobo item', () => {
    const resp = validateResponse(EXAMPLE) as ParseResponse;
    const draft = toDraft(resp);
    expect(draft.source).toBe('llm');
    expect(draft.pickupByMinute).toBe(20 * 60);
    expect(draft.items).toEqual([
      { foodItem: null, rawText: 'adobo', quantity: 3, unit: 'tray', flags: ['unmatched_item'] },
      { foodItem: 'pandesal', rawText: 'pandesal', quantity: 20, unit: 'piece', flags: [] },
    ]);
  });

  it('flags a missing quantity and a missing unit', () => {
    const draft = toDraft({
      items: [{ food_item: 'menudo', quantity: null, unit: null }],
      pickup_by: null,
      missing: ['quantity', 'unit', 'pickup_by'],
      source: 'llm',
    });
    expect(draft.items[0].flags).toEqual(['missing_quantity', 'missing_unit']);
    expect(draft.items[0].foodItem).toBe('menudo');
    expect(draft.pickupByMinute).toBeNull();
  });

  it('pickupMinute converts HH:MM and returns null for null', () => {
    expect(pickupMinute('16:00')).toBe(960);
    expect(pickupMinute('22:00')).toBe(1320);
    expect(pickupMinute(null)).toBeNull();
  });
});
