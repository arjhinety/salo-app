// The literal values below come from one deterministic run of E05 (tuning, simulated) with the store's untuned
// parameters, read to the end of the evening. If the engine's rules change, these literals change with them, on purpose.
import { SIM_END_MINUTE, LiveEvening } from '../evening';
import { bidRows, bidSpoken, bidText, type BidRow } from '../bids';
import type { EngineEvent, LogEntry, Minute } from '../../engine/types';

const UTIL = { need: 0.5, storage: 0.5, distance: 0.5, freshness: 0.5, total: 0.82 };
const logOf = (rows: [Minute, EngineEvent][]): LogEntry[] =>
  rows.map(([atMinute, event], i) => ({ seq: i + 1, evening: 'E05', policy: 'salo', atMinute, event }));
const msg = (message: Extract<EngineEvent, { type: 'MESSAGE' }>['message']): EngineEvent => ({ type: 'MESSAGE', message });

describe('bid list on a real E05 lot (DSH-03)', () => {
  const live = new LiveEvening({ policy: 'salo' });
  live.seek(SIM_END_MINUTE);
  const log = live.visibleLog();
  const lot = live.postedLots().find((l) => l.id === 'L0211');
  if (!lot) throw new Error('L0211 is not in E05');
  const rows = bidRows(log, { id: lot.id, donorId: lot.donorId }, 'salo');
  const bids = rows.filter((r) => r.kind === 'bid');

  test('lists all 29 pantry bids, largest share count first, then the refusal', () => {
    expect(bids).toHaveLength(29);
    expect(rows).toHaveLength(30);
    expect(bids.slice(0, 4).map((r) => [r.name, r.shares])).toEqual([
      ['Alalay Pantry', 16],
      ['Tanglaw Community Kitchen', 16],
      ['Hiraya Community Pantry', 16],
      ['Bukal Community Kitchen', 16],
    ]);
    const shares = bids.map((r) => r.shares ?? -1);
    expect([...shares].sort((a, b) => b - a)).toEqual(shares);
  });

  test('prints the story row shape: name, shares, fridge, distance, value', () => {
    const bukal = bids.find((r) => r.pantryId === 'P01') as BidRow;
    expect(bidText(bukal, 'salo')).toEqual({
      name: 'Bukal Community Kitchen',
      shares: '16',
      struck: false,
      facts: ['Has a fridge', '1.1 km', 'Values it at 0.94'],
      refused: null,
      remark: null,
    });
  });

  test('strikes the overtaken leader Pag-asa Kusina (11 shares) and stamps it with the outbidder', () => {
    const pag = bids.find((r) => r.pantryId === 'P05') as BidRow;
    const t = bidText(pag, 'salo');
    expect(t.struck).toBe(true);
    expect(t.shares).toBe('11');
    expect(t.remark).toBe('Re-marked at 17:37 when Alalay Pantry outbid Pag-asa Kusina');
    expect(bidSpoken(pag, 'salo')).toContain('was 11 shares');
  });

  test('a refusal reads REFUSED with its PAN-03 reason, after the bids', () => {
    const refused = rows[rows.length - 1];
    expect(refused.kind).toBe('refused');
    expect(bidText(refused, 'salo').refused).toEqual({ tag: 'REFUSED', reason: 'no remaining need today' });
  });
});

describe('bid list rule (DSH-03)', () => {
  // Socorro bids 9 first; Bukal bids 14 at 18:40 and overtakes it.
  const sequence = logOf([
    [1118, msg({ type: 'PROPOSE', proposer: 'pantry', lotId: 'L9', atMinute: 1118, pantryId: 'P02', shares: 9, utility: UTIL })],
    [1120, msg({ type: 'PROPOSE', proposer: 'pantry', lotId: 'L9', atMinute: 1120, pantryId: 'P01', shares: 14, utility: UTIL })],
    [1121, msg({ type: 'REFUSE', lotId: 'L9', atMinute: 1121, pantryId: 'P03', reason: 'closed_before_earliest_arrival' })],
  ]);

  test('the leader changes to Bukal at 14 shares and Socorro is struck through at 9', () => {
    const rows = bidRows(sequence, { id: 'L9', donorId: 'D01' }, 'salo');
    expect(rows.map((r) => r.name)).toEqual(['Bukal Community Kitchen', 'Socorro Street Pantry', 'Anonas Feeding Program']);
    expect(bidText(rows[0], 'salo').struck).toBe(false);
    expect(bidText(rows[0], 'salo').shares).toBe('14');
    expect(bidText(rows[1], 'salo')).toMatchObject({
      shares: '9',
      struck: true,
      remark: 'Re-marked at 18:40 when Bukal Community Kitchen outbid Socorro Street Pantry',
    });
    expect(bidSpoken(rows[1], 'salo')).toMatch(/^Socorro Street Pantry\. was 9 shares\./);
  });

  test('a tie does not overtake: the earlier bid keeps the lead and nothing is struck', () => {
    const tie = logOf([
      [1118, msg({ type: 'PROPOSE', proposer: 'pantry', lotId: 'L9', atMinute: 1118, pantryId: 'P02', shares: 9, utility: UTIL })],
      [1120, msg({ type: 'PROPOSE', proposer: 'pantry', lotId: 'L9', atMinute: 1120, pantryId: 'P01', shares: 9, utility: UTIL })],
    ]);
    const rows = bidRows(tie, { id: 'L9', donorId: 'D01' }, 'salo');
    expect(rows.map((r) => r.pantryId)).toEqual(['P02', 'P01']);
    expect(rows.every((r) => r.remark === null)).toBe(true);
  });

  test('a baseline has no shares: bids stay in arrival order and nothing is struck', () => {
    const rows = bidRows(sequence, { id: 'L9', donorId: 'D01' }, 'fcfs');
    expect(rows.map((r) => r.pantryId)).toEqual(['P02', 'P01', 'P03']);
    expect(bidText(rows[0], 'fcfs')).toMatchObject({ shares: null, struck: false });
  });
});
