import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../../engine/params';
import { runEvening } from '../../engine/simulate';
import type { LogEntry, Lot } from '../../engine/types';
import { indexWorld } from '../../engine/world';
import { LiveEvening } from '../../live/evening';
import { PANTRY_COPY } from '../../i18n/pantry';
import { kmText, whyFill, whySentence } from '../format';
import { myAwards, openLots, pantryLotViews, sharesLeft, valueFromParts, type PantryLotView } from '../model';

// Literal values come from one real run of tuning evening E05 under UNTUNED_PARAMS (the engine as it stands).
// If the engine's timing or scoring changes, these literals change with it, on purpose. Lot 14 is NOT used:
// the mockup's numbers are illustrative and the shares rule is untuned.

const WX = indexWorld(WORLD);
const E05 = EVENINGS.find((e) => e.id === 'E05')!;
const RUN = runEvening(WX, E05, { policy: 'salo', params: UNTUNED_PARAMS });
const LOG: readonly LogEntry[] = RUN.log;
const ROAD = (d: string, p: string) => WX.road(d, p).roadKm;

/** The views a pantry sees at a clock minute: every lot posted by then, folded from the same log. */
const at = (clock: number, pantryId: string): PantryLotView[] =>
  pantryLotViews({
    lots: E05.lots.filter((l: Lot) => l.postedMinute <= clock),
    log: LOG,
    pantryId,
    clock,
    roadKm: ROAD,
  });

const one = (clock: number, pantryId: string, lotId: string): PantryLotView => {
  const v = at(clock, pantryId).find((x) => x.lot.id === lotId);
  if (!v) throw new Error(`${lotId} not posted at ${clock}`);
  return v;
};

const P01 = 'P01';

describe('value parts (PAN-02), from the engine log', () => {
  test('L0216 at 18:00 for Bukal: parts add up to the total, and the total matches the engine', () => {
    const v = one(1080, P01, 'L0216');
    expect(v.status).toBe('delivered');
    expect(v.bid).not.toBeNull();
    expect(v.bid!.shares).toBe(16);
    expect(v.bid!.value).toEqual({ need: 0.4, storage: 0.3, distance: 0.13, freshness: 0.13, total: 0.96 });
    const p = v.bid!.value;
    expect(Math.round((p.need + p.storage + p.distance + p.freshness) * 100)).toBe(Math.round(p.total * 100));
    // The engine's own utility output (PROPOSE at 1065), not a re-computation.
    expect(v.bid!.engineTotal).toBeCloseTo(0.9644422700587084, 12);
    expect(Math.abs(p.total - v.bid!.engineTotal)).toBeLessThan(0.005);
  });

  test('L0247 at 18:06 for Bukal: 0.31 + 0.30 + 0.12 + 0.12 = 0.85, engine total 0.8534', () => {
    const v = one(1086, P01, 'L0247');
    expect(v.bid!.shares).toBe(15);
    expect(v.bid!.value).toEqual({ need: 0.31, storage: 0.3, distance: 0.12, freshness: 0.12, total: 0.85 });
    expect(v.bid!.engineTotal).toBeCloseTo(0.8534108699519658, 12);
  });

  test('L0207 while bidding: 0.40 + 0.30 + 0.12 + 0.12 = 0.94, engine total 0.9396', () => {
    const v = one(1025, P01, 'L0207');
    expect(v.status).toBe('bidding');
    expect(v.bid!.value).toEqual({ need: 0.4, storage: 0.3, distance: 0.12, freshness: 0.12, total: 0.94 });
    expect(v.bid!.engineTotal).toBeCloseTo(0.9396135029354207, 12);
  });

  test('every P01 bid on E05: displayed parts add up to the displayed total, which is within 0.02 of the engine', () => {
    const views = at(1440, P01).filter((v) => v.bid);
    expect(views.length).toBeGreaterThan(20);
    for (const v of views) {
      const p = v.bid!.value;
      expect(Math.round((p.need + p.storage + p.distance + p.freshness) * 100)).toBe(Math.round(p.total * 100));
      expect(Math.abs(p.total - v.bid!.engineTotal)).toBeLessThan(0.02);
    }
  });
});

describe('shares left (PAN-04, D-Q4)', () => {
  test('40 at the start; a losing bid spends nothing', () => {
    expect(sharesLeft(LOG, P01, 1040)).toBe(40);
    expect(one(1040, P01, 'L0207').status).toBe('outbid');
    expect(sharesLeft(LOG, P01, 1065)).toBe(40);
  });

  test('a winning bid of 16 leaves 24; a second win of 15 leaves 9', () => {
    expect(one(1066, P01, 'L0216').awardShares).toBe(16);
    expect(sharesLeft(LOG, P01, 1066)).toBe(24);
    expect(one(1084, P01, 'L0247').awardShares).toBe(15);
    expect(sharesLeft(LOG, P01, 1084)).toBe(9);
  });
});

describe('status derivation (PAN-05, PAN-06)', () => {
  test('outbid: P01 bid on L0207 at 17:23, and P13 won it at 17:28', () => {
    const before = one(1027, P01, 'L0207');
    expect(before.status).toBe('bidding');
    const after = one(1028, P01, 'L0207');
    expect(after.status).toBe('outbid');
    expect(after.awarded).toBe(false);
    expect(after.awardShares).toBeNull();
  });

  test('tentative, then final, then delivered, for the lot P01 won (L0216)', () => {
    expect(one(1066, P01, 'L0216').status).toBe('tentative');
    expect(one(1067, P01, 'L0216').status).toBe('tentative');
    expect(one(1068, P01, 'L0216').status).toBe('final');
    expect(one(1076, P01, 'L0216').status).toBe('delivered');
  });

  test('a tentative lot stays tentative until a driver commits', () => {
    const v = one(1067, P01, 'L0216');
    expect(v.status).toBe('tentative');
    expect(v.reannounced).toBe(false);
  });

  test('re-announcement: a driver withdraws while P01 holds L0247 (18:05), then a new driver commits (18:08)', () => {
    const tentative = one(1084, P01, 'L0247');
    expect(tentative.status).toBe('tentative');
    expect(tentative.reannounced).toBe(false);

    const withdrawn = one(1085, P01, 'L0247');
    expect(withdrawn.status).toBe('tentative');
    expect(withdrawn.reannounced).toBe(true);
    expect(withdrawn.awardShares).toBe(15);

    const final = one(1088, P01, 'L0247');
    expect(final.status).toBe('final');
    expect(final.reannounced).toBe(true);

    expect(one(1099, P01, 'L0247').status).toBe('delivered');
  });

  test('stranded: P24 held L0230 and no driver came (19:22, shown on P24 only)', () => {
    const v = one(1162, 'P24', 'L0230');
    expect(v.status).toBe('stranded');
    expect(v.awardShares).toBe(11);
  });

  test('refused: P10 refuses L0206 at 19:06 and the lot shows no value', () => {
    const v = one(1150, 'P10', 'L0206');
    expect(v.status).toBe('refused');
    expect(v.refuseReason).toBe('closed_before_earliest_arrival');
    expect(v.bid).toBeNull();
    expect(v.awardShares).toBeNull();
  });

  test('a refused lot never has a value, for any pantry on E05', () => {
    for (const v of at(1440, 'P10')) {
      if (v.status === 'refused') expect(v.bid).toBeNull();
    }
    const refusals = at(1440, 'P10').filter((v) => v.status === 'refused');
    expect(refusals.length).toBeGreaterThan(0);
  });
});

describe('open lots and awards (PAN-01)', () => {
  test('a lot is open until its pickup-by minute, then it leaves the open list', () => {
    expect(one(1065, P01, 'L0207').open).toBe(true);
    expect(one(1066, P01, 'L0207').open).toBe(false);
    expect(openLots(at(1066, P01)).map((v) => v.lot.id)).not.toContain('L0207');
    expect(openLots(at(1065, P01)).map((v) => v.lot.id)).toContain('L0207');
  });

  test('awards are split from open lots and kept whatever their deadline', () => {
    const views = at(1099, P01);
    expect(myAwards(views).map((v) => v.lot.id)).toEqual(['L0216', 'L0247']);
    expect(openLots(views).map((v) => v.lot.id)).not.toContain('L0216');
    expect(openLots(views).map((v) => v.lot.id)).not.toContain('L0247');
  });

  test('the distance is the road distance from the world data, in km', () => {
    // L0216 is posted by D03; the road leg D03 to P01 is 0.53 km in the dataset (shown as 0.5 at one decimal).
    const v = one(1080, P01, 'L0216');
    expect(v.lot.donorId).toBe('D03');
    expect(v.roadKm).toBeCloseTo(ROAD('D03', P01), 12);
    expect(v.roadKm).toBeCloseTo(0.53, 2);
    expect(kmText(v.roadKm)).toBe('0.5');
  });
});

describe('why sentence (PAN-07)', () => {
  test('the sentence is a template filled with the numbers, and changing one part changes it', () => {
    const v = one(1086, P01, 'L0247');
    const value = v.bid!.value;
    const left = sharesLeft(LOG, P01, 1086);
    const base = whySentence(v.status, whyFill('Bukal Community Kitchen', value, v.bid!.shares, left, v.roadKm))!;
    expect(base).toContain('0.85');
    expect(base).toContain('15 shares');
    expect(base).toContain('Natira ngayon: 9 shares');
    expect(base).toContain('Shares left now: 9');

    const lowerNeed = valueFromParts({ need: 0.21, storage: 0.3, distance: 0.12, freshness: 0.12 });
    const changed = whySentence(v.status, whyFill('Bukal Community Kitchen', lowerNeed, v.bid!.shares, left, v.roadKm))!;
    expect(lowerNeed.total).toBe(0.75);
    expect(changed).toContain('0.75');
    expect(changed).not.toContain('0.85');
    expect(changed).not.toBe(base);
  });

  test('a refused lot has no why sentence', () => {
    expect(whySentence('refused', whyFill('X', valueFromParts({ need: 0, storage: 0, distance: 0, freshness: 0 }), 0, 40, 1))).toBeNull();
  });

  test('the template strings exist for each sentence kind', () => {
    expect(PANTRY_COPY.why.heading).toBe('Bakit sa amin ito? · Why did you get this lot?');
    expect(PANTRY_COPY.reannounced.tentative).toContain('re-announced');
  });
});

describe('a cancelled driver on the live store (PAN-06, the Cancel driver path)', () => {
  // The same engine run as the dashboard's Cancel driver: the operator cancels the driver of L0216 (FINAL) at 17:50.
  test('the pantry keeps the award with the re-announce note; a new driver commits; the note stays', () => {
    const live = new LiveEvening({ startMinute: 1070 });
    expect(live.cancelDriver('L0216').ok).toBe(true);
    const at = (clock: number) => {
      live.seek(clock);
      return pantryLotViews({ lots: live.postedLots(), log: live.visibleLog(), pantryId: P01, clock, roadKm: ROAD })
        .find((v) => v.lot.id === 'L0216')!;
    };

    const cancelled = at(1070);
    expect(cancelled.status).toBe('tentative');
    expect(cancelled.reannounced).toBe(true);
    expect(cancelled.awardShares).toBe(16);

    const recommitted = at(1072);
    expect(recommitted.status).toBe('final');
    expect(recommitted.reannounced).toBe(true);

    expect(at(1100).status).toBe('delivered');
    expect(at(1100).reannounced).toBe(true);
    // Shares are spent once per winning bid: L0216 (16) and L0247 (15) on this run, so 40 - 16 - 15 = 9.
    expect(sharesLeft(live.visibleLog(), P01, 1100)).toBe(9);
  });
});
