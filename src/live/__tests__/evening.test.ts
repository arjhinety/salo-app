import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../../engine/params';
import { runEvening } from '../../engine/simulate';
import type { LogEntry, LotItem, PolicyId } from '../../engine/types';
import { indexWorld } from '../../engine/world';
import { LiveEvening, type LiveLotDraft } from '../evening';
import { cancelledAtMinute } from '../tape';

// Hand-checked literal values below come from one deterministic run of E05 (tuning, simulated) with
// UNTUNED_PARAMS. If the engine's timing rules change, these literals change with them, on purpose.

const ADOBO: LotItem = {
  foodItem: 'adobo',
  foodItemFil: 'adobo',
  foodCategory: 'cooked_dish',
  quantity: 3,
  unit: 'tray',
  estKg: 6,
  loadUnits: 1,
  needsFridgeIfKept: true,
  maxHoursUnrefrigerated: 4,
};

const draft = (over: Partial<LiveLotDraft> = {}): LiveLotDraft => ({
  donorId: 'D01',
  items: [ADOBO],
  pickupByMinute: 1160,
  ...over,
});

/** A live evening at 18:20 (minute 1100), clock stopped until a test starts it. */
const at = (minute: number, policy: PolicyId = 'salo') => new LiveEvening({ startMinute: minute, policy });

/** Advance the clock by simulated minutes at the default 6 s per minute. */
const advance = (live: LiveEvening, minutes: number, fromMs = 0) => {
  live.tick(fromMs + minutes * 6 * 1000);
};

/** Every log row about one lot: its messages, state changes, and the inputs that name it. */
const entriesFor = (log: readonly LogEntry[], lotId: string): LogEntry[] =>
  log.filter((e) => {
    const ev = e.event;
    if (ev.type === 'AWARD_STATE') return ev.lotId === lotId;
    if (ev.type === 'MESSAGE') return ev.message.lotId === lotId;
    if (ev.type === 'INPUT') {
      return ev.input.type === 'LOT_POSTED' ? ev.input.lot.id === lotId : ev.input.type === 'CANCEL_DRIVER' && ev.input.lotId === lotId;
    }
    return false;
  });

describe('clock', () => {
  test('starts at 17:00, stopped, on tuning evening E05 and labelled simulated', () => {
    const live = new LiveEvening();
    const s = live.getSnapshot();
    expect(s.minute).toBe(1020);
    expect(s.running).toBe(false);
    expect(s.eveningId).toBe('E05');
    expect(s.split).toBe('tuning');
    expect(s.policy).toBe('salo');
    expect(s.secondsPerMinute).toBe(6);
  });

  test('advances by real time divided by the seconds per minute', () => {
    const live = new LiveEvening();
    live.start(0);
    live.tick(60_000); // 60 s at 6 s per minute = 10 minutes
    expect(live.getSnapshot().minute).toBe(1030);
    live.tick(69_000); // 69 s total = 11.5 minutes
    expect(live.getSnapshot().minute).toBe(1031);
  });

  test('pause freezes the clock; start resumes from there', () => {
    const live = new LiveEvening();
    live.start(0);
    live.tick(30_000); // 5 minutes
    live.pause(30_000);
    live.tick(300_000); // ignored while paused
    expect(live.getSnapshot().minute).toBe(1025);
    expect(live.getSnapshot().running).toBe(false);
    live.start(300_000);
    live.tick(330_000); // 30 s more = 5 minutes
    expect(live.getSnapshot().minute).toBe(1030);
  });

  test('a speed change counts elapsed time at the old speed', () => {
    const live = new LiveEvening();
    live.start(0);
    live.setSpeed(3, 30_000); // 30 s at 6 s per minute = 5 minutes, then 3 s per minute from here
    expect(live.getSnapshot().minute).toBe(1025);
    live.tick(90_000); // 60 s more at 3 s per minute = 20 minutes
    expect(live.getSnapshot().minute).toBe(1045);
  });

  test('stops at 21:30 and stays stopped', () => {
    const live = new LiveEvening();
    live.start(0);
    live.tick(10_000_000);
    const s = live.getSnapshot();
    expect(s.minute).toBe(1290);
    expect(s.ended).toBe(true);
    expect(s.running).toBe(false);
    live.start(20_000_000);
    expect(live.getSnapshot().running).toBe(false);
    expect(live.getSnapshot().minute).toBe(1290);
  });

  test('rejects a speed of zero or less', () => {
    const live = new LiveEvening();
    expect(() => live.setSpeed(0)).toThrow(RangeError);
    expect(() => live.setSpeed(-1)).toThrow(RangeError);
  });

  test('notifies subscribers only when the whole minute changes', () => {
    const live = new LiveEvening();
    const seen = jest.fn();
    const unsubscribe = live.subscribe(seen);
    live.start(0); // publish 1
    live.tick(1_000); // 1/6 minute: no visible change
    live.tick(5_000); // 5/6 minute: still 1020
    expect(seen).toHaveBeenCalledTimes(1);
    live.tick(6_000); // 1 minute
    expect(seen).toHaveBeenCalledTimes(2);
    expect(live.getSnapshot().minute).toBe(1021);
    unsubscribe();
    live.tick(60_000);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  test('only tuning evenings can be played live', () => {
    expect(() => new LiveEvening({ eveningId: 'E11' })).toThrow(/tuning/);
    expect(() => new LiveEvening({ eveningId: 'E21' })).toThrow(/tuning/);
    expect(() => new LiveEvening({ eveningId: 'E99' })).toThrow(/no evening/);
  });
});

describe('posting a live lot', () => {
  test('gets id LIVE-1 at the posting minute and is an input in the log', () => {
    const live = at(1100);
    const r = live.postLot(draft());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe('LIVE-1');
    expect(r.value.postedMinute).toBe(1100);
    expect(r.value.pickupByMinute).toBe(1160);
    expect(r.value.origin).toBe('live');
    expect(r.value.estKg).toBe(6);
    expect(r.value.loadUnits).toBe(1);
    expect(live.inputLog()).toEqual([
      expect.objectContaining({ atMinute: 1100, input: expect.objectContaining({ type: 'LOT_POSTED' }) }),
    ]);
    const inputs = live.visibleLog().filter((e) => e.event.type === 'INPUT');
    expect(inputs).toHaveLength(1);
    expect(inputs[0].atMinute).toBe(1100);
    const call = live.visibleLog().find((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'CALL_FOR_PROPOSALS' && e.event.message.lotId === 'LIVE-1');
    expect(call?.atMinute).toBe(1100);
  });

  test('then gets TENTATIVE_ACCEPT and COMMIT like a dataset lot (literal minutes from the E05 run)', () => {
    const live = at(1100);
    live.postLot(draft());
    live.start(0);
    live.tick(10_000_000); // to 21:30
    const states = entriesFor(live.visibleLog(), 'LIVE-1')
      .filter((e) => e.event.type === 'AWARD_STATE')
      .map((e) => `${e.atMinute}:${(e.event as { state: string }).state}`);
    expect(states).toEqual(['1100:announced', '1105:tentative', '1106:final', '1122:delivered']);
    const types = entriesFor(live.visibleLog(), 'LIVE-1')
      .filter((e) => e.event.type === 'MESSAGE')
      .map((e) => (e.event as { message: { type: string } }).message.type);
    expect(types).toContain('TENTATIVE_ACCEPT');
    expect(types).toContain('COMMIT');
  });

  test('is refused with clear problems: unknown donor, pickup not after the clock, no items', () => {
    const live = at(1100);
    const bad = live.postLot(draft({ donorId: 'D99', pickupByMinute: 1100, items: [] }));
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.problems).toEqual([
      'no donor D99',
      'pickup time must be later than the clock',
      'a lot needs at least one item',
    ]);
    expect(live.inputLog()).toHaveLength(0);
    // a refused post does not use up an id
    const ok = live.postLot(draft());
    expect(ok.ok && ok.value.id).toBe('LIVE-1');
  });
});

describe('cancelling a driver', () => {
  test('on a FINAL lot: FAILURE cancelled_by_operator, then the lot is re-announced to drivers', () => {
    const live = at(1100);
    live.postLot(draft());
    live.start(0);
    advance(live, 6); // 1106: LIVE-1 is FINAL
    expect(live.stateOf('LIVE-1')).toBe('final');
    const r = live.cancelDriver('LIVE-1');
    expect(r.ok).toBe(true);
    live.tick(10_000_000);
    const rows = entriesFor(live.visibleLog(), 'LIVE-1');
    const failIdx = rows.findIndex((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'FAILURE');
    expect(failIdx).toBeGreaterThan(-1);
    const fail = rows[failIdx].event as { message: { reason: string; atMinute: number } };
    expect(fail.message.reason).toBe('cancelled_by_operator');
    expect(rows[failIdx].atMinute).toBe(1106);
    const reannounce = rows.slice(failIdx + 1).find((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'CALL_FOR_PROPOSALS');
    expect(reannounce).toBeDefined();
    expect((reannounce!.event as { message: { target: string } }).message.target).toBe('driver');
    // re-announced after the seeded 1-3 min reply delay (decision "Driver reply delay"): 1106 + 3
    expect(reannounce!.atMinute).toBe(1109);
    // the award goes back to tentative, then the lot is re-committed or stranded
    const after = rows.slice(failIdx).find((e) => e.event.type === 'AWARD_STATE');
    expect((after!.event as { state: string }).state).toBe('tentative');
  });

  test('is refused unless the lot is FINAL at the clock', () => {
    const live = at(1100);
    live.postLot(draft());
    expect(live.cancelDriver('LIVE-1')).toEqual({ ok: false, problems: ['lot LIVE-1 is announced, not final'] });
    expect(live.cancelDriver('L9999')).toEqual({ ok: false, problems: ['lot L9999 is not posted yet'] });
    expect(live.inputLog()).toHaveLength(1);
  });

  test('works on a dataset lot that is final at 18:05 (L0211, D01)', () => {
    const live = at(1065);
    expect(live.stateOf('L0211')).toBe('final');
    expect(live.cancelDriver('L0211').ok).toBe(true);
    live.start(0);
    live.tick(10_000_000);
    const fail = live.visibleLog().find(
      (e) => e.event.type === 'MESSAGE' && e.event.message.type === 'FAILURE' && e.event.message.lotId === 'L0211',
    );
    expect(fail?.atMinute).toBe(1065);
  });
});

describe('policy and memoization', () => {
  test('setPolicy re-runs the same inputs: the visible log equals a fresh run with those inputs', () => {
    const live = at(1100);
    live.postLot(draft());
    live.start(0);
    advance(live, 20);
    const inputsBefore = JSON.stringify(live.inputLog());
    live.setPolicy('fcfs');
    expect(JSON.stringify(live.inputLog())).toBe(inputsBefore);
    expect(live.getSnapshot().policy).toBe('fcfs');
    const fresh = runEvening(indexWorld(WORLD), EVENINGS.find((e) => e.id === 'E05')!, {
      policy: 'fcfs',
      params: UNTUNED_PARAMS,
      inputs: live.inputLog().map((i) => ({ atMinute: i.atMinute, input: i.input })),
    });
    const expected = fresh.log.filter((e) => e.atMinute <= 1120);
    expect(JSON.stringify(live.visibleLog())).toBe(JSON.stringify(expected));
  });

  test('the engine re-runs only when inputs or policy change, never on ticks', () => {
    const live = at(1100);
    live.postLot(draft());
    live.visibleLog();
    expect(live.runCount).toBe(1);
    live.start(0);
    for (let i = 0; i < 50; i++) live.tick(i * 1000);
    live.visibleLog();
    live.lotViews('D01');
    expect(live.runCount).toBe(1);
    live.setPolicy('nearest');
    live.visibleLog();
    expect(live.runCount).toBe(2);
    live.postLot(draft({ pickupByMinute: 1200 }));
    live.visibleLog();
    expect(live.runCount).toBe(3);
  });

  test('setPolicy to the same policy does nothing', () => {
    const live = at(1100);
    const seen = jest.fn();
    live.subscribe(seen);
    live.setPolicy('salo');
    expect(seen).not.toHaveBeenCalled();
  });
});

describe('determinism and views', () => {
  test('the same inputs give an identical log JSON', () => {
    const play = () => {
      const live = at(1100);
      live.postLot(draft());
      live.start(0);
      advance(live, 6);
      live.cancelDriver('LIVE-1');
      live.tick(10_000_000);
      return JSON.stringify(live.visibleLog());
    };
    expect(play()).toBe(play());
  });

  test('lotViews folds a live lot into the same LotView shape as a dataset lot', () => {
    const live = at(1100);
    live.postLot(draft());
    const atPost = live.lotViews('D01').find((v) => v.lot.id === 'LIVE-1');
    expect(atPost).toMatchObject({ state: 'bids', station: 1, pantryName: null, driverName: null });
    expect(atPost!.bids).toBeGreaterThan(0);
    live.start(0);
    advance(live, 6);
    const view = live.lotViews('D01').find((v) => v.lot.id === 'LIVE-1');
    expect(view).toMatchObject({ state: 'final', station: 3, driverName: expect.any(String), pantryName: expect.any(String) });
    expect(view!.etaMinute).toBeGreaterThan(1106);
  });

  test('lotViews only lists the asked donor and only lots posted by the clock', () => {
    const live = at(1100);
    live.postLot(draft());
    const ids = live.lotViews('D01').map((v) => v.lot.id);
    expect(ids).toContain('LIVE-1');
    expect(ids).not.toContain('D02');
    expect(live.lotViews('D02').map((v) => v.lot.id)).toEqual(
      EVENINGS.find((e) => e.id === 'E05')!.lots.filter((l) => l.donorId === 'D02' && l.postedMinute <= 1100).map((l) => l.id),
    );
  });

  test('lotViews is cached until the next publish', () => {
    const live = at(1100);
    live.postLot(draft());
    const a = live.lotViews('D01');
    expect(live.lotViews('D01')).toBe(a);
    live.start(0);
    live.tick(6_000);
    expect(live.lotViews('D01')).not.toBe(a);
  });
});

describe('postedLots', () => {
  test('counts the dataset lots posted by the clock, then adds a live lot at the clock', () => {
    // E05 posts L0207 and L0227 at 17:03, and L0242 at 17:10 (minutes 1023, 1023, 1030)
    const live = at(1030);
    expect(live.postedLots().map((l) => l.id)).toEqual(['L0207', 'L0227', 'L0242']);
    expect(live.postLot(draft()).ok).toBe(true);
    expect(live.postedLots().map((l) => l.id)).toEqual(['L0207', 'L0227', 'L0242', 'LIVE-1']);
  });
});

describe('replay with baseline rewinds the clock', () => {
  test('replayUnder goes to 17:00, paused, under the new policy, with the same input log', () => {
    const live = at(1100);
    live.postLot(draft());
    live.start(0);
    advance(live, 30);
    const inputsBefore = JSON.stringify(live.inputLog());
    expect(live.getSnapshot().minute).toBe(1130);
    live.replayUnder('fcfs');
    const s = live.getSnapshot();
    expect(s.minute).toBe(1020);
    expect(s.running).toBe(false);
    expect(s.ended).toBe(false);
    expect(s.policy).toBe('fcfs');
    expect(JSON.stringify(live.inputLog())).toBe(inputsBefore);
    // paused: ticks do nothing until the panel presses play again
    live.tick(600_000);
    expect(live.getSnapshot().minute).toBe(1020);
  });

  test('after a rewind the evening plays again from 17:00 and the inputs come back at their minutes', () => {
    const live = at(1100);
    live.postLot(draft()); // posted at 18:20
    live.replayUnder('nearest');
    expect(live.visibleLog().some((e) => e.event.type === 'INPUT')).toBe(false);
    live.seek(1100);
    expect(live.visibleLog().some((e) => e.event.type === 'INPUT')).toBe(true);
  });

  test('replayUnder re-runs the engine only when the policy changes', () => {
    const live = at(1100);
    live.visibleLog();
    expect(live.runCount).toBe(1);
    live.replayUnder('salo');
    live.visibleLog();
    expect(live.runCount).toBe(1);
    live.replayUnder('central_greedy');
    live.visibleLog();
    expect(live.runCount).toBe(2);
  });

  test('replayUnder publishes once, so subscribers re-render the rewound clock', () => {
    const live = at(1100);
    const seen = jest.fn();
    live.subscribe(seen);
    live.replayUnder('fcfs');
    expect(seen).toHaveBeenCalledTimes(1);
  });
});

describe('seek (ruler scrubbing)', () => {
  test('seeks to a whole minute and pauses a running clock', () => {
    const live = at(1100);
    live.start(0);
    live.seek(1185.4);
    const s = live.getSnapshot();
    expect(s.minute).toBe(1185);
    expect(s.running).toBe(false);
    live.tick(600_000);
    expect(live.getSnapshot().minute).toBe(1185);
  });

  test('clamps to 17:00 through 21:30', () => {
    const live = at(1100);
    live.seek(0);
    expect(live.getSnapshot().minute).toBe(1020);
    live.seek(99_999);
    const s = live.getSnapshot();
    expect(s.minute).toBe(1290);
    expect(s.ended).toBe(true);
  });

  test('a seek is refused for a non-finite minute', () => {
    const live = at(1100);
    expect(() => live.seek(Number.NaN)).toThrow(RangeError);
    expect(live.getSnapshot().minute).toBe(1100);
  });

  test('seeking changes only the visible log: the input log and the engine run are untouched', () => {
    const live = at(1100);
    live.postLot(draft());
    live.visibleLog();
    const runsBefore = live.runCount;
    const inputsBefore = JSON.stringify(live.inputLog());
    const fullBefore = JSON.stringify(live.visibleLog());
    live.seek(1060);
    expect(live.runCount).toBe(runsBefore);
    expect(JSON.stringify(live.inputLog())).toBe(inputsBefore);
    const shown = live.visibleLog();
    expect(shown.every((e) => e.atMinute <= 1060)).toBe(true);
    expect(shown.length).toBeLessThan(JSON.parse(fullBefore).length);
    live.seek(1100);
    expect(JSON.stringify(live.visibleLog())).toBe(fullBefore);
    expect(live.runCount).toBe(runsBefore);
  });

  test('seek publishes a snapshot with the new minute', () => {
    const live = at(1100);
    const seen = jest.fn();
    live.subscribe(seen);
    live.seek(1150);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(live.getSnapshot().minute).toBe(1150);
  });
});

describe('the cancel status line follows the clock (replay and seek clear it)', () => {
  test('after a cancel at 18:26, a replay to 17:00 or a seek before 18:26 shows no cancel; the input stays in the log', () => {
    const live = at(1100);
    live.postLot(draft());
    live.start(0);
    advance(live, 6); // 1106: LIVE-1 is FINAL
    live.pause(0);
    expect(live.cancelDriver('LIVE-1').ok).toBe(true);
    const cancelAt = live.inputLog().find((i) => i.input.type === 'CANCEL_DRIVER')!.atMinute;
    expect(cancelAt).toBe(1106);
    const shownAt = (m: number) => cancelledAtMinute(live.inputLog(), 'LIVE-1', m);
    expect(shownAt(live.getSnapshot().minute)).toBe(1106);

    live.replayUnder('fcfs');
    expect(live.getSnapshot().minute).toBe(1020);
    expect(shownAt(live.getSnapshot().minute)).toBeNull();

    live.seek(1105);
    expect(shownAt(live.getSnapshot().minute)).toBeNull();
    live.seek(1106);
    expect(shownAt(live.getSnapshot().minute)).toBe(1106);
    expect(live.inputLog().some((i) => i.input.type === 'CANCEL_DRIVER')).toBe(true);
  });
});
