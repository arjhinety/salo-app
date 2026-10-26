// Literal counts come from one deterministic run of E05 (tuning, simulated) with the store's untuned parameters, read to
// the end of the evening (21:30). If the engine's rules change, these counts change with them, on purpose.
import { ALL_POSITIONS, donorPosition, driverPosition, pantryPosition } from '../../data/places';
import { SIM_END_MINUTE, LiveEvening } from '../evening';
import { dash } from '../../i18n/strings';
import { FRAME, frameOf, placesInvolved, project, routeDashed, routeLegs } from '../schematic';
import type { AwardState, EngineEvent, Lot, LogEntry, Minute } from '../../engine/types';

const W = 360;
const H = 300;
const PAD = 20;

describe('projection (DSH-06)', () => {
  test('keeps relative order: east is right, north is up, for every pair of bundled places', () => {
    const pts = ALL_POSITIONS.map((p) => ({ p, s: project(p, FRAME, W, H, PAD) }));
    for (const a of pts) {
      for (const b of pts) {
        if (a.p.lon < b.p.lon) expect(a.s.x).toBeLessThan(b.s.x);
        if (a.p.lat > b.p.lat) expect(a.s.y).toBeLessThan(b.s.y);
      }
    }
  });

  test('stays inside the box with the padding', () => {
    for (const p of ALL_POSITIONS) {
      const s = project(p, FRAME, W, H, PAD);
      expect(s.x).toBeGreaterThanOrEqual(PAD - 1e-9);
      expect(s.x).toBeLessThanOrEqual(W - PAD + 1e-9);
      expect(s.y).toBeGreaterThanOrEqual(PAD - 1e-9);
      expect(s.y).toBeLessThanOrEqual(H - PAD + 1e-9);
    }
  });

  test('the fixed frame is the bounds of every bundled place, so a place never moves as the evening fills in', () => {
    expect(FRAME).toEqual(frameOf(ALL_POSITIONS));
    const d01 = donorPosition('D01');
    if (!d01) throw new Error('D01 missing');
    expect(project(d01, FRAME, W, H, PAD)).toEqual(project(d01, frameOf(ALL_POSITIONS), W, H, PAD));
  });

  test('a driver home has its bundled position', () => {
    expect(driverPosition('V01')).toEqual({ lat: 14.629239, lon: 121.045226 });
    expect(pantryPosition('P01')).toEqual({ lat: 14.622694, lon: 121.058242 });
  });
});

describe('route style follows the award state (DSH-06)', () => {
  test('tentative is dashed; final and delivered are solid; other states draw no route', () => {
    expect(routeDashed('tentative')).toBe(true);
    expect(routeDashed('final')).toBe(false);
    expect(routeDashed('delivered')).toBe(false);
    for (const s of ['announced', 'stranded', 'unawarded', undefined] as (AwardState | undefined)[]) {
      expect(routeDashed(s)).toBeNull();
    }
  });

  test('a route is dashed while the award is tentative and turns solid when a COMMIT makes it final', () => {
    const lot: Lot = { id: 'L9', donorId: 'D01', items: [], estKg: 0, loadUnits: 0, postedMinute: 1100, pickupByMinute: 1200, origin: 'dataset' };
    const tentative = logOf([
      [1104, msg({ type: 'TENTATIVE_ACCEPT', lotId: 'L9', atMinute: 1104, donorId: 'D01', pantryId: 'P01', shares: 14 })],
    ]);
    expect(routeLegs(tentative, [lot], () => 'tentative')).toEqual([{ lotId: 'L9', donorId: 'D01', pantryId: 'P01', dashed: true }]);
    const final = logOf([
      [1104, msg({ type: 'TENTATIVE_ACCEPT', lotId: 'L9', atMinute: 1104, donorId: 'D01', pantryId: 'P01', shares: 14 })],
      [1106, msg({ type: 'COMMIT', lotId: 'L9', atMinute: 1106, driverId: 'V01', pantryId: 'P01', etaMinute: 1118 })],
    ]);
    expect(routeLegs(final, [lot], () => 'final')).toEqual([{ lotId: 'L9', donorId: 'D01', pantryId: 'P01', dashed: false }]);
  });
});

describe('places tonight on E05 at 21:30', () => {
  const live = new LiveEvening({ policy: 'salo' });
  live.seek(SIM_END_MINUTE);
  const log = live.visibleLog();
  const lots = live.postedLots();
  const rows = placesInvolved(log, lots, (id) => live.stateOf(id));
  const count = (k: string) => rows.filter((r) => r.kind === k).length;

  test('31 donors that posted, 30 pantries that answered, 40 drivers that were asked', () => {
    expect(count('donor')).toBe(31);
    expect(count('pantry')).toBe(30);
    expect(count('driver')).toBe(40);
  });

  test('every row has a position and a street; a driver row names the donor its offer is for', () => {
    for (const r of rows) {
      expect(Number.isFinite(r.position.lat)).toBe(true);
      expect(r.street.length).toBeGreaterThan(0);
    }
    const driver = rows.find((r) => r.id === 'V01');
    expect(driver?.rightNow).toBe('offered for L0243');
    expect(driver?.from).toBe('Karinderya ni Mang Teban');
  });

  test('42 route legs, none dashed at the end (every award is final, delivered or stranded)', () => {
    const legs = routeLegs(log, lots, (id) => live.stateOf(id));
    expect(legs).toHaveLength(42);
    expect(legs.filter((l) => l.dashed)).toHaveLength(0);
  });
});

describe('table wording', () => {
  test('the spoken row carries the name, role, street, right now and from', () => {
    expect(dash.rowA11y('Bukal Community Kitchen', 'Pantry', '15th Avenue', 'bid on L0211', 'Karinderya ni Aling Oning')).toBe(
      'Bukal Community Kitchen. Pantry. 15th Avenue. Right now: bid on L0211. From Karinderya ni Aling Oning.',
    );
  });
});

const msg = (message: Extract<EngineEvent, { type: 'MESSAGE' }>['message']): EngineEvent => ({ type: 'MESSAGE', message });
const logOf = (rows: [Minute, EngineEvent][]): LogEntry[] =>
  rows.map(([atMinute, event], i) => ({ seq: i + 1, evening: 'E05', policy: 'salo', atMinute, event }));
