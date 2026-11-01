import { createHash } from 'crypto';
import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../params';
import { POLICY_IDS } from '../policies';
import { LEARNING_OFF_ESTIMATE, runEvening, type RunOutput } from '../simulate';
import type { Evening, Lot, LogEntry, LotItem, World } from '../types';
import { indexWorld } from '../world';
import fixture from './fixtures/head-digests.json';

// RES-07: the learning-off option. The agents' estimate stays at 0.50; show and no-show outcomes do not change.

const wx = indexWorld(WORLD);
const tuning = EVENINGS.filter((e) => e.split === 'tuning');
const digest = (out: RunOutput) =>
  createHash('sha256').update(JSON.stringify({ log: out.log, result: out.result, driverRuleStats: out.driverRuleStats })).digest('hex');

/** Every reliability estimate the log shows, in order: the driver PROPOSE reliability and each RELIABILITY_UPDATED estimate. */
function estimatesIn(log: readonly LogEntry[]): number[] {
  const out: number[] = [];
  for (const { event } of log) {
    if (event.type === 'MESSAGE' && event.message.type === 'PROPOSE' && event.message.proposer === 'driver') out.push(event.message.reliability);
    if (event.type === 'RELIABILITY_UPDATED') out.push(event.estimate);
  }
  return out;
}

/** Driver failures as (minute, lot, driver, reason). */
function failuresIn(log: readonly LogEntry[]) {
  return log.flatMap(({ atMinute, event }) =>
    event.type === 'MESSAGE' && event.message.type === 'FAILURE'
      ? [[atMinute, event.message.lotId, event.message.driverId, event.message.reason]]
      : []);
}

/** No lot is final before a COMMIT for it, and no lot is delivered without being final first. */
function checkTwoPhase(log: readonly LogEntry[]) {
  const committed = new Set<string>();
  for (const { event } of log) {
    if (event.type === 'MESSAGE' && event.message.type === 'COMMIT') committed.add(event.message.lotId);
    if (event.type === 'MESSAGE' && event.message.type === 'FAILURE') committed.delete(event.message.lotId);
    if (event.type === 'AWARD_STATE' && event.state === 'final') expect(committed.has(event.lotId)).toBe(true);
    if (event.type === 'DELIVERY') expect(committed.has(event.lotId)).toBe(true);
  }
}

// ---------------------------------------------------------------------------
// A hand-built world: one donor, one pantry, one driver, two lots. The driver never shows (true show rate 0).
// ---------------------------------------------------------------------------

const item: LotItem = {
  foodItem: 'rice', foodItemFil: 'kanin', foodCategory: 'cooked_rice', quantity: 1, unit: 'tray', estKg: 10, loadUnits: 1,
  needsFridgeIfKept: false, maxHoursUnrefrigerated: 4,
};
const lot = (n: number, postedMinute: number): Lot => ({
  id: `L000${n}`, donorId: 'DN1', items: [item], estKg: 10, loadUnits: 1, postedMinute, pickupByMinute: postedMinute + 200,
  origin: 'dataset',
});
const smallWorld: World = {
  donors: [{ id: 'DN1', name: 'Donor One', type: 'karinderya', street: 'a', closingMinute: 1300, anchor: false }],
  pantries: [{
    id: 'P1', name: 'Pantry One', type: 'community pantry', street: 'b', opensMinute: 900, closesMinute: 1400, hasFridge: true,
    fridgeCapacityKg: 100, dryStorageKg: 100, anchor: false,
  }],
  drivers: [{
    id: 'D1', name: 'Driver One', vehicle: 'motorcycle', capacityLoadUnits: 10, street: 'c', availableFromMinute: 900,
    availableToMinute: 1400, tuningRuns: 0, tuningShows: 0, frozenReliability: 0.5, anchor: false,
  }],
  roads: [{ donorId: 'DN1', pantryId: 'P1', roadKm: 2, minutes: { motorcycle: 5, car: 6, tricycle: 7, bicycle: 9 } }],
  driverLegs: [{ driverId: 'D1', donorId: 'DN1', roadKm: 1, minutes: 4 }],
  lateMinutes: [3],
};
const smallWx = indexWorld(smallWorld);
// Seed 1: the driver commits to each lot and does not show, both times (not a withdrawal). Found by scanning seeds 1 to 3000.
const noShowTwice: Evening = {
  id: 'T1', seed: 1, split: 'tuning', date: '2026-10-01', needs: [{ pantryId: 'P1', isOpen: true, needKg: 100 }],
  lots: [lot(1, 1000), lot(2, 1100)],
};

describe('learning off: the estimate read at every decision is 0.50 (RES-07)', () => {
  it('the constant is the prior before any run: exactly 0.5', () => {
    expect(LEARNING_OFF_ESTIMATE).toBe(0.5);
  });

  it('learning on: a driver who no-shows twice is at 1/3 after one no-show and 0.25 after two, (0+1)/(2+2)=0.25', () => {
    const { log } = runEvening(smallWx, noShowTwice, { policy: 'fcfs', params: UNTUNED_PARAMS, trueShowRate: { D1: 0 } });
    expect(failuresIn(log).map((f) => f[3])).toEqual(['no_show', 'no_show']);
    // Lot 1 is offered at 0.50 (no runs yet). After its no-show the estimate is (0+1)/(1+2). Lot 2 is offered at that
    // value. After its no-show it is (0+1)/(2+2) = 0.25.
    expect(estimatesIn(log)).toEqual([0.5, 1 / 3, 1 / 3, 0.25]);
  });

  it('learning off: the same driver stays at 0.50 at every offer and every update', () => {
    const { log } = runEvening(smallWx, noShowTwice, {
      policy: 'fcfs', params: UNTUNED_PARAMS, trueShowRate: { D1: 0 }, learning: false,
    });
    expect(estimatesIn(log)).toEqual([0.5, 0.5, 0.5, 0.5]);
    // Each RELIABILITY_UPDATED still counts the real outcomes (runs and shows); only the estimate is fixed.
    const updates = log.flatMap(({ event }) => (event.type === 'RELIABILITY_UPDATED' ? [[event.shows, event.runs]] : []));
    expect(updates).toEqual([[0, 1], [0, 2]]);
  });

  it('learning off: the no-shows happen at the same minutes, for the same lots, as with learning on', () => {
    const on = runEvening(smallWx, noShowTwice, { policy: 'fcfs', params: UNTUNED_PARAMS, trueShowRate: { D1: 0 } });
    const off = runEvening(smallWx, noShowTwice, { policy: 'fcfs', params: UNTUNED_PARAMS, trueShowRate: { D1: 0 }, learning: false });
    expect(failuresIn(off.log)).toEqual([[1012, 'L0001', 'D1', 'no_show'], [1111, 'L0002', 'D1', 'no_show']]);
    expect(failuresIn(off.log)).toEqual(failuresIn(on.log));
  });
});

describe('learning off on the tuning evenings: a valid run (RES-07)', () => {
  it.each(POLICY_IDS)('%s: two-phase commit, accounting and the 0..1 range hold on every tuning evening', (policy) => {
    for (const ev of tuning) {
      const { log, result } = runEvening(wx, ev, { policy, params: UNTUNED_PARAMS, learning: false });
      checkTwoPhase(log);
      const posted = ev.lots.reduce((s, l) => s + l.estKg, 0);
      expect(result.foodRescuedKg + result.foodWastedKg).toBeCloseTo(posted, 6);
      expect(result.foodRescuedKg).toBeGreaterThanOrEqual(0);
      if (result.worstNeedMet !== null) {
        expect(result.worstNeedMet).toBeGreaterThanOrEqual(0);
        expect(result.worstNeedMet).toBeLessThanOrEqual(1);
      }
      expect(estimatesIn(log).every((x) => x === 0.5)).toBe(true);
    }
  });

  it('the option is not a no-op: on the tuning evenings, learning on shows estimates other than 0.50', () => {
    const on = tuning.flatMap((ev) => estimatesIn(runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS }).log));
    expect(on.some((x) => x !== 0.5)).toBe(true);
  });
});

describe('learning absent or true: the same runs as before the option (byte-identical)', () => {
  it('E01-E10 x four policies: learning absent and learning true give the same digest, and both equal the HEAD fixture', () => {
    for (const ev of tuning) {
      for (const policy of POLICY_IDS) {
        const absent = digest(runEvening(wx, ev, { policy, params: UNTUNED_PARAMS }));
        const isTrue = digest(runEvening(wx, ev, { policy, params: UNTUNED_PARAMS, learning: true }));
        const key = `${ev.id}/${policy}` as keyof typeof fixture.digests;
        expect(isTrue).toBe(absent);
        expect(absent).toBe(fixture.digests[key]);
      }
    }
  });
});
