/**
 * Requests and runs of a held driver, from real E05 runs (decision D-Q5). Literal values were read from the engine's
 * own log and checked against docs/handoffs/2026-10-26-mobile-architect-human-driver.md (tests a to e there).
 */
import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../../engine/params';
import { runEvening, type RunOutput } from '../../engine/simulate';
import type { EngineInput, LogEntry, Lot, Minute } from '../../engine/types';
import { indexWorld } from '../../engine/world';
import { driverBoard, type Ask, type DriverBoard } from '../board';

const WX = indexWorld(WORLD);
const E05 = EVENINGS.find((e) => e.id === 'E05')!;
const LOTS = new Map<string, Lot>(E05.lots.map((l) => [l.id, l]));
const V19 = WORLD.drivers.find((d) => d.id === 'V19')!;

type Answer = Extract<EngineInput, { type: 'DRIVER_RESPONSE' }>;
const answer = (atMinute: Minute, lotId: string, answer: Answer['answer'], driverId = 'V19') => ({
  atMinute,
  input: { type: 'DRIVER_RESPONSE', driverId, lotId, answer } as EngineInput,
});

function heldRun(held: string, inputs: { atMinute: Minute; input: EngineInput }[] = []): RunOutput {
  return runEvening(WX, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: new Set([held]), inputs });
}

/** The board as the screen sees it at `now`: only the log up to that minute. */
function boardAt(run: RunOutput, now: Minute, driver = V19): DriverBoard {
  const log: LogEntry[] = run.log.filter((e) => e.atMinute <= now);
  return driverBoard({ log, driver, wx: WX, lots: LOTS, now });
}

const lotIds = (asks: readonly Ask[]) => asks.map((a) => a.lot.id);

describe('V19 held and silent on E05', () => {
  const silent = heldRun('V19');

  it('is asked 40 times, in engine order, and every window ends expired', () => {
    const b = boardAt(silent, 99999);
    expect(b.asks).toHaveLength(40);
    expect(b.asks.slice(0, 3).map((a) => [a.lot.id, a.askedMinute, a.closesMinute, a.status, a.statusMinute])).toEqual([
      ['L0207', 1030, 1033, 'expired', 1033],
      ['L0227', 1031, 1034, 'expired', 1034],
      ['L0242', 1036, 1039, 'expired', 1039],
    ]);
    expect(b.asks.every((a) => a.status === 'expired')).toBe(true);
  });

  it('shows the request until its window ends, then it is gone (declined by silence)', () => {
    const open = (now: Minute) => lotIds(boardAt(silent, now).asks.filter((a) => a.status === 'asked'));
    expect(open(1032)).toEqual(['L0207', 'L0227']);
    expect(open(1033)).toEqual(['L0227']);
    expect(open(1034)).toEqual([]);
  });

  it('offers only while the window is open and the engine would accept the ETA', () => {
    // L0227 at 1031: pickup 1035, arrival 1038, deadline min(pickup-by 1110, pantry close 1140, availability 1260).
    const at1031 = boardAt(silent, 1031);
    const ask = at1031.asks.find((a) => a.lot.id === 'L0227')!;
    expect(at1031.offerTrip(ask)).toEqual({ pickup: 1035, arrive: 1038, deadline: 1110 });
    // Window closed at 1034: no offer control.
    const at1034 = boardAt(silent, 1034);
    expect(at1034.offerTrip(at1034.asks.find((a) => a.lot.id === 'L0227')!)).toBeNull();
  });
});

describe('offer, pick, commit, delivery', () => {
  const run = heldRun('V19', [answer(1031, 'L0227', 'offer'), answer(1032, 'L0227', 'commit')]);

  it('shows the picked state between the offer and the commit, with the engine ETA', () => {
    const ask = boardAt(run, 1031).asks.find((a) => a.lot.id === 'L0227')!;
    expect([ask.status, ask.askedMinute, ask.offerEtaMinute, ask.pickupMinute]).toEqual(['picked', 1031, 1038, 1035]);
  });

  it('commits at 1032 and is delivered at 1038, on time', () => {
    const ask = boardAt(run, 99999).asks.find((a) => a.lot.id === 'L0227')!;
    expect(ask).toMatchObject({
      status: 'delivered', statusMinute: 1038, commitMinute: 1032, commitEtaMinute: 1038,
      deliveredMinute: 1038, onTime: true, minutesLate: 0,
    });
  });

  it('the log agrees: COMMIT V19 eta 1038 at 1032 and DELIVERY V19 at 1038, onTime', () => {
    const msgs = run.log.filter((e) => e.event.type === 'MESSAGE' || e.event.type === 'DELIVERY');
    const commit = msgs.find((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'COMMIT' && e.event.message.driverId === 'V19');
    const delivery = msgs.find((e) => e.event.type === 'DELIVERY' && e.event.driverId === 'V19');
    expect(commit).toMatchObject({ atMinute: 1032, event: { message: { etaMinute: 1038 } } });
    expect(delivery).toMatchObject({ atMinute: 1038, event: { onTime: true, pantryId: 'P19' } });
  });
});

describe('withdraw and missed commits count as missed runs', () => {
  it('withdraw after the offer, before commit: FAILURE withdrew at 1032, reliability 6 of 7', () => {
    const run = heldRun('V19', [answer(1031, 'L0227', 'offer'), answer(1032, 'L0227', 'withdraw')]);
    const ask = boardAt(run, 1032).asks.find((a) => a.lot.id === 'L0227')!;
    expect([ask.status, ask.statusMinute]).toEqual(['withdrawn', 1032]);
    const fail = run.log.find((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'FAILURE' && e.event.message.driverId === 'V19');
    expect(fail).toMatchObject({ atMinute: 1032, event: { message: { reason: 'withdrew_before_commit', lotId: 'L0227' } } });
    const rel = run.log.find((e) => e.event.type === 'RELIABILITY_UPDATED' && e.event.driverId === 'V19');
    expect(rel).toMatchObject({ atMinute: 1032, event: { shows: 6, runs: 7 } });
  });

  it('offer, then no commit: no_reply at 1034 (offer minute + 3), reliability 6 of 7', () => {
    const run = heldRun('V19', [answer(1031, 'L0227', 'offer')]);
    const ask = boardAt(run, 99999).asks.find((a) => a.lot.id === 'L0227')!;
    expect([ask.status, ask.statusMinute]).toEqual(['no_reply', 1034]);
    const fail = run.log.find((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'FAILURE' && e.event.message.driverId === 'V19');
    expect(fail).toMatchObject({ atMinute: 1034, event: { message: { reason: 'no_reply' } } });
  });
});

describe('decline sends nothing and removes the request', () => {
  const run = heldRun('V19', [answer(1031, 'L0227', 'decline')]);

  it('marks the ask declined at 1031, with no PROPOSE from V19 at that minute', () => {
    const ask = boardAt(run, 99999).asks.find((a) => a.lot.id === 'L0227')!;
    expect([ask.status, ask.statusMinute]).toEqual(['declined', 1031]);
    const v19Propose = run.log.some(
      (e) => e.atMinute === 1031 && e.event.type === 'MESSAGE' && e.event.message.type === 'PROPOSE' && e.event.message.proposer === 'driver' && e.event.message.driverId === 'V19',
    );
    expect(v19Propose).toBe(false);
  });

  it('the engine then commits V34 for L0227 at 1031, with ETA 1039', () => {
    const commit = run.log.find((e) => e.atMinute === 1031 && e.event.type === 'MESSAGE' && e.event.message.type === 'COMMIT');
    expect(commit).toMatchObject({ event: { message: { driverId: 'V34', etaMinute: 1039, lotId: 'L0227' } } });
  });
});

describe('agreement with the engine, every driver round of E05', () => {
  // For each round in which the derived board says V19 is asked, a single offer at that minute must be accepted (a PROPOSE
  // by V19 at that minute), and in every other round the same single offer must be ignored. The run before the offer's
  // minute is identical to the silent run, so this compares the derivation with the engine's own waiting set.
  it('matches all 48 driver rounds', () => {
    const silent = heldRun('V19');
    const board = boardAt(silent, 99999);
    const rounds = silent.log.filter(
      (e) => e.event.type === 'MESSAGE' && e.event.message.type === 'CALL_FOR_PROPOSALS' && e.event.message.target === 'driver',
    );
    expect(rounds).toHaveLength(48);
    const askedAt = new Set(board.asks.map((a) => `${a.lot.id}@${a.askedMinute}`));
    const mismatches: string[] = [];
    let accepted = 0;
    for (const r of rounds) {
      if (r.event.type !== 'MESSAGE' || r.event.message.type !== 'CALL_FOR_PROPOSALS') continue;
      const lotId = r.event.message.lotId;
      const probe = heldRun('V19', [answer(r.atMinute, lotId, 'offer')]);
      const proposed = probe.log.some(
        (e) => e.atMinute === r.atMinute && e.event.type === 'MESSAGE' && e.event.message.type === 'PROPOSE' &&
          e.event.message.proposer === 'driver' && e.event.message.driverId === 'V19' && e.event.message.lotId === lotId,
      );
      if (proposed) accepted += 1;
      if (proposed !== askedAt.has(`${lotId}@${r.atMinute}`)) mismatches.push(`${lotId}@${r.atMinute}`);
    }
    expect(mismatches).toEqual([]);
    expect(accepted).toBe(40);
  }, 60000);
});
