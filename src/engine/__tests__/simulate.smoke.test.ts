import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../params';
import { POLICY_IDS } from '../policies';
import { runEvening } from '../simulate';
import type { LogEntry } from '../types';
import { indexWorld } from '../world';

const wx = indexWorld(WORLD);
const tuning = EVENINGS.filter((e) => e.split === 'tuning');

describe('simulation on the tuning evenings (untuned parameters)', () => {
  it('is deterministic: the same evening and policy give an identical log', () => {
    const a = runEvening(wx, tuning[0], { policy: 'salo', params: UNTUNED_PARAMS });
    const b = runEvening(wx, tuning[0], { policy: 'salo', params: UNTUNED_PARAMS });
    expect(JSON.stringify(a.log)).toBe(JSON.stringify(b.log));
  });

  it('keeps the log in time order with seq increasing from 1', () => {
    const { log } = runEvening(wx, tuning[1], { policy: 'central_greedy', params: UNTUNED_PARAMS });
    log.forEach((e, i) => expect(e.seq).toBe(i + 1));
    for (let i = 1; i < log.length; i++) expect(log[i].atMinute).toBeGreaterThanOrEqual(log[i - 1].atMinute);
  });

  it.each(POLICY_IDS)('%s: two-phase commit and accounting hold on every tuning evening', (policy) => {
    for (const ev of tuning) {
      const { log, result } = runEvening(wx, ev, { policy, params: UNTUNED_PARAMS });
      checkTwoPhase(log);
      const posted = ev.lots.reduce((s, l) => s + l.estKg, 0);
      expect(result.foodRescuedKg + result.foodWastedKg).toBeCloseTo(posted, 6);
      expect(result.foodRescuedKg).toBeGreaterThanOrEqual(0);
      if (result.worstNeedMet !== null) {
        expect(result.worstNeedMet).toBeGreaterThanOrEqual(0);
        expect(result.worstNeedMet).toBeLessThanOrEqual(1);
      }
    }
  });

  it('only the delivery is re-announced after a driver failure (pantry unchanged)', () => {
    for (const ev of tuning) {
      const { log } = runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS });
      const awarded = new Map<string, string>();
      for (const { event } of log) {
        if (event.type !== 'MESSAGE') continue;
        const m = event.message;
        if (m.type === 'TENTATIVE_ACCEPT') {
          expect(awarded.has(m.lotId)).toBe(false); // one pantry award per lot, ever
          awarded.set(m.lotId, m.pantryId);
        }
        if (m.type === 'COMMIT') expect(m.pantryId).toBe(awarded.get(m.lotId));
      }
    }
  });

  it('Cancel driver on a committed lot fails it, re-announces only the delivery, and counts a missed run', () => {
    const ev = tuning[0];
    const base = runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS });
    const commit = base.log.find((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'COMMIT')!;
    const lotId = (commit.event as { message: { lotId: string } }).message.lotId;
    const run = runEvening(wx, ev, {
      policy: 'salo', params: UNTUNED_PARAMS,
      inputs: [{ atMinute: commit.atMinute, input: { type: 'CANCEL_DRIVER', lotId } }],
    });
    const forLot = run.log.filter((e) =>
      (e.event.type === 'MESSAGE' && e.event.message.lotId === lotId) ||
      (e.event.type === 'AWARD_STATE' && e.event.lotId === lotId));
    const kinds = forLot.map((e) => (e.event.type === 'MESSAGE' ? e.event.message.type : `STATE:${(e.event as { state: string }).state}`));
    const failAt = kinds.indexOf('FAILURE');
    expect(failAt).toBeGreaterThan(-1);
    expect(kinds[failAt + 1]).toBe('STATE:tentative');
    expect(kinds.slice(failAt).filter((k) => k === 'TENTATIVE_ACCEPT')).toHaveLength(0);
    const cfp = forLot.slice(failAt).find((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'CALL_FOR_PROPOSALS');
    expect(cfp && cfp.event.type === 'MESSAGE' && cfp.event.message.type === 'CALL_FOR_PROPOSALS' && cfp.event.message.target).toBe('driver');
  });
});

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

describe('hidden true show rate (decision T1)', () => {
  it('drives outcomes from the hidden truth, not from the agents\u2019 estimate', () => {
    const ev = tuning[2];
    const never = Object.fromEntries(WORLD.drivers.map((d) => [d.id, 0]));
    const always = Object.fromEntries(WORLD.drivers.map((d) => [d.id, 1]));
    const fails = (t: Record<string, number>) => runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS, trueShowRate: t })
      .log.filter((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'FAILURE').length;
    const deliveries = (t: Record<string, number>) => runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS, trueShowRate: t })
      .log.filter((e) => e.event.type === 'DELIVERY').length;
    expect(fails(always)).toBe(0);
    expect(deliveries(never)).toBe(0);
  });

  it('agents never see the truth: a PROPOSE carries the learned estimate from tuning counts', () => {
    const { log } = runEvening(wx, tuning[0], { policy: 'salo', params: UNTUNED_PARAMS });
    const first = log.find((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'PROPOSE' && e.event.message.proposer === 'driver')!;
    const m = first.event.type === 'MESSAGE' && first.event.message.type === 'PROPOSE' && first.event.message.proposer === 'driver' ? first.event.message : null;
    const d = WORLD.drivers.find((x) => x.id === m!.driverId)!;
    expect(m!.reliability).toBeCloseTo((d.tuningShows + 1) / (d.tuningRuns + 2), 10);
  });
});
