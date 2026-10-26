import { createHash } from 'crypto';
import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../params';
import { POLICY_IDS } from '../policies';
import { runEvening } from '../simulate';
import type { LogEntry, PolicyId } from '../types';
import { indexWorld } from '../world';
import digests from './fixtures/head-digests.json';
import resultsHead from './fixtures/head-results.json';

// Story PAN-04: under Salo a pantry with 0 shares left refuses the lot with 'no_shares_left', checked after the other
// refusals. Expected counts were read from a HEAD run (before the change) with the same replay as `pantryReplies`.

const wx = indexWorld(WORLD);
const tuning = EVENINGS.filter((e) => e.split === 'tuning');
const BUDGET = UNTUNED_PARAMS.salo.shareBudgetPerEvening;
const sha = (x: unknown) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

interface Reply { atMinute: number; lotId: string; pantryId: string; left: number; kind: 'PROPOSE' | 'REFUSE'; shares?: number; reason?: string }

/** Every pantry reply in log order, with the pantry's shares left at that moment. TENTATIVE_ACCEPT spends shares (D-Q4). */
function pantryReplies(log: readonly LogEntry[]): Reply[] {
  const left = new Map<string, number>(WORLD.pantries.map((p) => [p.id, BUDGET]));
  const out: Reply[] = [];
  for (const { atMinute, event } of log) {
    if (event.type !== 'MESSAGE') continue;
    const m = event.message;
    if (m.type === 'TENTATIVE_ACCEPT') left.set(m.pantryId, (left.get(m.pantryId) ?? 0) - m.shares);
    if (m.type === 'PROPOSE' && m.proposer === 'pantry') {
      out.push({ atMinute, lotId: m.lotId, pantryId: m.pantryId, left: left.get(m.pantryId)!, kind: 'PROPOSE', shares: m.shares });
    }
    if (m.type === 'REFUSE') {
      out.push({ atMinute, lotId: m.lotId, pantryId: m.pantryId, left: left.get(m.pantryId)!, kind: 'REFUSE', reason: m.reason });
    }
  }
  return out;
}

const EXISTING_REFUSALS = ['closed_before_earliest_arrival', 'cannot_store_lot', 'no_remaining_need'];

describe('no shares left (story PAN-04)', () => {
  it('E01-E10 x four policies: the result of every run equals the HEAD result', () => {
    expect(Object.keys(resultsHead.digests)).toHaveLength(40);
    for (const ev of tuning) {
      for (const policy of POLICY_IDS) {
        const out = runEvening(wx, ev, { policy, params: UNTUNED_PARAMS });
        expect(sha(out.result)).toBe(resultsHead.digests[`${ev.id}/${policy}` as keyof typeof resultsHead.digests]);
      }
    }
  });

  it('fcfs, nearest and central_greedy: the full log is byte-identical to the HEAD digest', () => {
    const others: PolicyId[] = ['fcfs', 'nearest', 'central_greedy'];
    for (const ev of tuning) {
      for (const policy of others) {
        const out = runEvening(wx, ev, { policy, params: UNTUNED_PARAMS });
        const d = sha({ log: out.log, result: out.result, driverRuleStats: out.driverRuleStats });
        expect(d).toBe(digests.digests[`${ev.id}/${policy}` as keyof typeof digests.digests]);
      }
    }
  });

  it('salo: 126 former 0-share PROPOSEs are now REFUSE no_shares_left, and no PROPOSE comes from a pantry with 0 left', () => {
    // Per evening, the HEAD counts of PROPOSEs from pantries with 0 shares left: E01 1, E02 17, E03 76, E06 11,
    // E07 5, E08 8, E10 8, the rest 0. The total is the orchestrator's count, 126.
    const expectedPerEvening: Record<string, number> = { E01: 1, E02: 17, E03: 76, E04: 0, E05: 0, E06: 11, E07: 5, E08: 8, E09: 0, E10: 8 };
    let total = 0;
    for (const ev of tuning) {
      const { log } = runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS });
      const replies = pantryReplies(log);
      const refusedNoShares = replies.filter((r) => r.kind === 'REFUSE' && r.reason === 'no_shares_left');
      expect(refusedNoShares.every((r) => r.left <= 0)).toBe(true);
      expect(replies.filter((r) => r.kind === 'PROPOSE' && r.left <= 0)).toEqual([]);
      // A pantry at 0 left is refused, for an existing reason or for no_shares_left.
      for (const r of replies.filter((x) => x.left <= 0 && x.kind === 'REFUSE')) {
        expect(r.reason === 'no_shares_left' || EXISTING_REFUSALS.includes(r.reason!)).toBe(true);
      }
      // A PROPOSE never bids more than the pantry has left.
      for (const r of replies.filter((x) => x.kind === 'PROPOSE')) expect(r.shares!).toBeLessThanOrEqual(r.left);
      expect(refusedNoShares).toHaveLength(expectedPerEvening[ev.id]);
      total += refusedNoShares.length;
    }
    expect(total).toBe(126);
  });

  it('constructed: a pantry at 0 left that would be the only bidder refuses under salo, and both lots stay unawarded', () => {
    // E05 with one open pantry (P01) and a zero budget, so P01 has 0 shares from the start. The other pantries are
    // closed to the lots (refused as closed, before the shares check).
    const e05 = EVENINGS.find((e) => e.id === 'E05')!;
    const only = { ...e05, needs: e05.needs.filter((n) => n.pantryId === 'P01') };
    const zero = { ...UNTUNED_PARAMS, salo: { ...UNTUNED_PARAMS.salo, shareBudgetPerEvening: 0 } };

    const salo = runEvening(wx, only, { policy: 'salo', params: zero });
    const saloReplies = pantryReplies(salo.log);
    // On the two lots P01 would have bid on in the baseline, it refuses at 1023 with no_shares_left.
    expect(saloReplies.filter((r) => r.pantryId === 'P01' && (r.lotId === 'L0207' || r.lotId === 'L0227'))
      .map((r) => [r.atMinute, r.lotId, r.kind, r.reason])).toEqual([
      [1023, 'L0207', 'REFUSE', 'no_shares_left'],
      [1023, 'L0227', 'REFUSE', 'no_shares_left'],
    ]);
    // P01 never proposes, and no lot is awarded under salo.
    expect(saloReplies.filter((r) => r.pantryId === 'P01' && r.kind === 'PROPOSE')).toEqual([]);
    // The closed pantry P11 has 0 shares too, but the existing closed refusal comes first.
    expect(saloReplies.filter((r) => r.pantryId === 'P11')[0]).toMatchObject({ kind: 'REFUSE', reason: 'closed_before_earliest_arrival' });
    expect(salo.log.some((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'TENTATIVE_ACCEPT')).toBe(false);
    expect(salo.log.filter((e) => e.event.type === 'AWARD_STATE' && e.event.state === 'unawarded'
      && (e.event.lotId === 'L0207' || e.event.lotId === 'L0227')).map((e) => e.event))
      .toEqual([
        { type: 'AWARD_STATE', lotId: 'L0207', state: 'unawarded' },
        { type: 'AWARD_STATE', lotId: 'L0227', state: 'unawarded' },
      ]);
    expect(salo.result).toMatchObject({ foodRescuedKg: 0, strandedAwards: 0 });

    // The same setup under first-come-first-served is not affected: P01 bids 0 shares and wins L0207.
    const fcfs = runEvening(wx, only, { policy: 'fcfs', params: zero });
    expect(fcfs.log.some((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'PROPOSE' && e.event.message.proposer === 'pantry'
      && e.event.message.pantryId === 'P01' && e.event.message.shares === 0)).toBe(true);
    expect(fcfs.log.some((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'TENTATIVE_ACCEPT' && e.event.message.pantryId === 'P01')).toBe(true);
  });
});
