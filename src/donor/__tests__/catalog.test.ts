import { EVENINGS } from '../../data/dataset';
import { buildCatalog, CATALOG, estKgFor, findEntry, loadUnitsFor, type CatalogEntry } from '../catalog';
import { donorItemKeys, splitPicker } from '../postForm';

// Worked literal values, checked against the bundled dataset v1.2. If the dataset changes, these change on purpose.

const adobo = () => {
  const e = findEntry('pork adobo', 'tray');
  if (!e) throw new Error('pork adobo (tray) missing from the catalog');
  return e;
};
const pandesal = () => {
  const e = findEntry('pandesal', 'piece');
  if (!e) throw new Error('pandesal (piece) missing from the catalog');
  return e;
};
const chickenAdobo = () => {
  const e = findEntry('chicken adobo', 'tray');
  if (!e) throw new Error('chicken adobo (tray) missing from the catalog');
  return e;
};

describe('catalog', () => {
  test('one entry per (foodItem, unit)', () => {
    const keys = CATALOG.map((e) => `${e.foodItem}|${e.unit}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(CATALOG.length).toBe(23);
  });

  test('pork adobo tray: kgPerUnit 2, quantities 1 to 3', () => {
    expect(adobo()).toMatchObject({ foodItemFil: 'adobong baboy', kgPerUnit: 2, minQty: 1, maxQty: 3, needsFridgeIfKept: true, maxHoursUnrefrigerated: 2 });
  });

  test('pandesal piece: kgPerUnit 0.03, quantities 20 to 100, no fridge needed', () => {
    expect(pandesal()).toMatchObject({ kgPerUnit: 0.03, minQty: 20, maxQty: 100, needsFridgeIfKept: false });
  });

  test('estKg: 3 trays of adobo is 6 kg; 20 pandesal is 0.6 kg', () => {
    expect(estKgFor(3, adobo())).toBe(6);
    expect(estKgFor(20, pandesal())).toBe(0.6);
  });

  test('every catalog entry has a positive kgPerUnit and quantities inside 1..maxQty', () => {
    for (const e of CATALOG) {
      expect(e.kgPerUnit).toBeGreaterThan(0);
      expect(e.minQty).toBeGreaterThanOrEqual(1);
      expect(e.maxQty).toBeGreaterThanOrEqual(e.minQty);
    }
  });

  test('kgPerUnit is the median, so a rounded item (sardines) keeps its usual value', () => {
    const sardines = findEntry('canned sardines', 'can');
    expect(sardines?.kgPerUnit).toBe(0.155);
  });

  test('buildCatalog reads only the lots it is given', () => {
    const one = buildCatalog([EVENINGS.find((e) => e.id === 'E05')!]);
    expect(one.length).toBeLessThan(CATALOG.length);
    expect(one.length).toBeGreaterThan(0);
  });
});

describe('load units (assumption mirroring the dataset generator)', () => {
  test('chicken adobo (1 to 4): qty 1 gives 1, qty 4 gives 3, qty 2 gives 2', () => {
    const e = chickenAdobo();
    expect([e.minQty, e.maxQty]).toEqual([1, 4]);
    expect(loadUnitsFor(1, e)).toBe(1);
    expect(loadUnitsFor(4, e)).toBe(3);
    expect(loadUnitsFor(2, e)).toBe(2); // round(1 + 2 * (1/3)) = round(1.67) = 2
  });

  test('pandesal (20 to 100): the minimum gives 1, the maximum gives 3', () => {
    expect(loadUnitsFor(20, pandesal())).toBe(1);
    expect(loadUnitsFor(100, pandesal())).toBe(3);
  });

  test('a single-size item (min equals max) is always load unit 1', () => {
    const fixed: CatalogEntry = { ...adobo(), minQty: 3, maxQty: 3 };
    expect(loadUnitsFor(3, fixed)).toBe(1);
  });
});

describe('picker order for donor D01', () => {
  test('the items D01 has posted in any evening come first', () => {
    const history = donorItemKeys(EVENINGS, 'D01');
    expect(history.size).toBe(9);
    const { mine, others } = splitPicker(CATALOG, history);
    expect(mine.length).toBe(9);
    expect(mine.every((e) => history.has(`${e.foodItem}|${e.unit}`))).toBe(true);
    expect(others.some((e) => history.has(`${e.foodItem}|${e.unit}`))).toBe(false);
    expect(mine.length + others.length).toBe(CATALOG.length);
  });
});
