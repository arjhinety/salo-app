import type { AgentMessage, EngineEvent, LogEntry, LotId, Minute } from '../../engine/types';
import { barLabel, clock24, lotsWithBids, stripState, tapeLines, tentativeBars, type NameLookup } from '../tape';

const NAMES: NameLookup = {
  donor: () => 'Karinderya ni Aling Oning',
  pantry: (id) => (id === 'P01' ? 'Bukal Community Kitchen' : id),
  driver: (id) => (id === 'V01' ? 'R. Dizon' : id),
};

const LOT: LotId = 'L0211';
const UTIL = { need: 0.5, storage: 0.5, distance: 0.5, freshness: 0.5, total: 0.74 };

/** Builds a log from (minute, event) pairs. seq follows the order given, as the engine does. */
const logOf = (rows: [Minute, EngineEvent][]): LogEntry[] =>
  rows.map(([atMinute, event], i) => ({ seq: i + 1, evening: 'E05', policy: 'salo', atMinute, event }));
const msg = (message: AgentMessage): EngineEvent => ({ type: 'MESSAGE', message });

describe('clock24', () => {
  test('formats minutes after midnight as 24-hour HH:MM', () => {
    expect(clock24(1020)).toBe('17:00');
    expect(clock24(1185)).toBe('19:45');
    expect(clock24(1290)).toBe('21:30');
    expect(clock24(5)).toBe('00:05');
  });
});

describe('tapeLines', () => {
  test('prints each message of one lot as a line with its type, who and detail', () => {
    const log = logOf([
      [1100, msg({ type: 'CALL_FOR_PROPOSALS', lotId: LOT, atMinute: 1100, target: 'pantry', from: 'D01' })],
      [1101, msg({ type: 'PROPOSE', proposer: 'pantry', lotId: LOT, atMinute: 1101, pantryId: 'P01', shares: 2, utility: UTIL })],
      [1101, msg({ type: 'REFUSE', lotId: LOT, atMinute: 1101, pantryId: 'P02', reason: 'closed_before_earliest_arrival' })],
      [1102, msg({ type: 'REFUSE', lotId: LOT, atMinute: 1102, pantryId: 'P03', reason: 'cannot_store_lot' })],
      [1102, msg({ type: 'REFUSE', lotId: LOT, atMinute: 1102, pantryId: 'P04', reason: 'no_remaining_need' })],
      [1103, msg({ type: 'PROPOSE', proposer: 'driver', lotId: LOT, atMinute: 1103, driverId: 'V01', etaMinute: 1118, reliability: 0.85 })],
      [1104, msg({ type: 'TENTATIVE_ACCEPT', lotId: LOT, atMinute: 1104, donorId: 'D01', pantryId: 'P01', shares: 2 })],
      [1106, msg({ type: 'COMMIT', lotId: LOT, atMinute: 1106, driverId: 'V01', pantryId: 'P01', etaMinute: 1118 })],
      [1110, msg({ type: 'FAILURE', lotId: LOT, atMinute: 1110, driverId: 'V01', reason: 'cancelled_by_operator' })],
      [1120, { type: 'DELIVERY', lotId: LOT, pantryId: 'P01', driverId: 'V01', kg: 6, onTime: false, minutesLate: 3 }],
      // another lot's line must not appear
      [1100, msg({ type: 'CALL_FOR_PROPOSALS', lotId: 'L0999', atMinute: 1100, target: 'pantry', from: 'D02' })],
    ]);
    // 1100 is 18:20, 1118 is 18:38, 1120 is 18:40 (clock24 counts from midnight)
    expect(tapeLines(log, LOT, NAMES).map((l) => `${clock24(l.minute)} ${l.type} ${l.who} · ${l.detail}`)).toEqual([
      '18:20 CALL Karinderya ni Aling Oning · to pantries',
      '18:21 PROPOSE Bukal Community Kitchen · 2 shares · value 74%',
      '18:21 REFUSE P02 · closed before the earliest driver could arrive',
      "18:22 REFUSE P03 · can't store it, too big for dry and fridge space",
      '18:22 REFUSE P04 · no remaining need today',
      '18:23 PROPOSE R. Dizon · ETA 18:38 · reliability 85%',
      '18:24 TENTATIVE Bukal Community Kitchen · 2 shares, award held',
      '18:26 COMMIT R. Dizon · to Bukal Community Kitchen · ETA 18:38',
      '18:30 FAILURE R. Dizon · driver cancelled by the operator',
      '18:40 DELIVERED R. Dizon · to Bukal Community Kitchen · 3 min late',
    ]);
  });

  test('only the FAILURE line is flagged for strike-through', () => {
    const log = logOf([
      [1100, msg({ type: 'FAILURE', lotId: LOT, atMinute: 1100, driverId: 'V01', reason: 'no_show' })],
      [1100, msg({ type: 'COMMIT', lotId: LOT, atMinute: 1100, driverId: 'V01', pantryId: 'P01', etaMinute: 1110 })],
    ]);
    expect(tapeLines(log, LOT, NAMES).map((l) => l.alert)).toEqual([true, false]);
  });
});

describe('tentativeBars', () => {
  test('an open wait counts whole minutes from TENTATIVE_ACCEPT to the clock', () => {
    const log = logOf([[1100, msg({ type: 'TENTATIVE_ACCEPT', lotId: LOT, atMinute: 1100, donorId: 'D01', pantryId: 'P01', shares: 2 })]]);
    const bars = tentativeBars(log, LOT, 'tentative', 1103);
    expect(bars).toEqual([{ startSeq: 1, startMinute: 1100, endMinute: 1103, status: 'open', minutes: 3 }]);
    expect(barLabel(bars[0])).toBe('TENTATIVE · held until a driver commits · 3 min');
  });

  test('a COMMIT caps the bar at the minutes waited', () => {
    const log = logOf([
      [1100, msg({ type: 'TENTATIVE_ACCEPT', lotId: LOT, atMinute: 1100, donorId: 'D01', pantryId: 'P01', shares: 2 })],
      [1102, msg({ type: 'COMMIT', lotId: LOT, atMinute: 1102, driverId: 'V01', pantryId: 'P01', etaMinute: 1115 })],
    ]);
    const bars = tentativeBars(log, LOT, 'final', 1130);
    expect(bars).toEqual([{ startSeq: 1, startMinute: 1100, endMinute: 1102, status: 'committed', minutes: 2 }]);
    expect(barLabel(bars[0])).toBe('held 2 min · driver committed');
  });

  test('a FAILURE strikes the waiting bar and starts the re-announcement bar at the same minute', () => {
    const log = logOf([
      [1100, msg({ type: 'TENTATIVE_ACCEPT', lotId: LOT, atMinute: 1100, donorId: 'D01', pantryId: 'P01', shares: 2 })],
      [1104, msg({ type: 'FAILURE', lotId: LOT, atMinute: 1104, driverId: 'V01', reason: 'no_show' })],
      [1105, msg({ type: 'COMMIT', lotId: LOT, atMinute: 1105, driverId: 'V02', pantryId: 'P01', etaMinute: 1120 })],
    ]);
    // at the clock 1106 the lot is FINAL again: the struck bar is 4 min, the re-announced bar is 1 min and capped
    const bars = tentativeBars(log, LOT, 'final', 1106);
    expect(bars).toEqual([
      { startSeq: 1, startMinute: 1100, endMinute: 1104, status: 'struck', minutes: 4 },
      { startSeq: 2, startMinute: 1104, endMinute: 1105, status: 'committed', minutes: 1 },
    ]);
    expect(barLabel(bars[0])).toBe('held 4 min · driver failed');
  });

  test('after a FAILURE the re-announced bar is open while the lot is tentative', () => {
    const log = logOf([
      [1100, msg({ type: 'TENTATIVE_ACCEPT', lotId: LOT, atMinute: 1100, donorId: 'D01', pantryId: 'P01', shares: 2 })],
      [1104, msg({ type: 'FAILURE', lotId: LOT, atMinute: 1104, driverId: 'V01', reason: 'withdrew_before_commit' })],
    ]);
    const bars = tentativeBars(log, LOT, 'tentative', 1106);
    expect(bars.map((b) => [b.status, b.minutes])).toEqual([
      ['struck', 4],
      ['open', 2],
    ]);
  });

  test('a stranded lot keeps its struck bar and drops the waiting one', () => {
    const log = logOf([
      [1100, msg({ type: 'TENTATIVE_ACCEPT', lotId: LOT, atMinute: 1100, donorId: 'D01', pantryId: 'P01', shares: 2 })],
      [1103, msg({ type: 'FAILURE', lotId: LOT, atMinute: 1103, driverId: 'V01', reason: 'no_show' })],
    ]);
    const bars = tentativeBars(log, LOT, 'stranded', 1110);
    expect(bars.map((b) => [b.status, b.minutes])).toEqual([['struck', 3]]);
  });
});

describe('lot strip states', () => {
  test('a lot with a pantry bid shows BIDS IN only while it is still announced', () => {
    const log = logOf([
      [1100, msg({ type: 'PROPOSE', proposer: 'pantry', lotId: LOT, atMinute: 1100, pantryId: 'P01', shares: 1, utility: UTIL })],
      [1100, msg({ type: 'PROPOSE', proposer: 'driver', lotId: 'L0300', atMinute: 1100, driverId: 'V01', etaMinute: 1110, reliability: 0.5 })],
    ]);
    expect([...lotsWithBids(log)]).toEqual([LOT]);
    expect(stripState('announced', true)).toBe('bids');
    expect(stripState('announced', false)).toBe('announced');
    expect(stripState('final', true)).toBe('final');
    expect(stripState(undefined, false)).toBe('announced');
  });
});
