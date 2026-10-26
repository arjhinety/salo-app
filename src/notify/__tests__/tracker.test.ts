/**
 * Dedupe, backlog and jumps (CC-12), on the real E05 held run. The tracker sees the same events the phone sees, minute by
 * minute, and must announce each event once: never the backlog on open, never after a join, never after a scrub.
 */
import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../../engine/params';
import { runEvening, type RunOutput } from '../../engine/simulate';
import type { EngineInput, Lot } from '../../engine/types';
import { indexWorld } from '../../engine/world';
import { notifyEvents, type NotifyEvent } from '../events';
import { MAX_LIVE_STEP, NotifyTracker } from '../tracker';

const WX = indexWorld(WORLD);
const E05 = EVENINGS.find((e) => e.id === 'E05')!;
const LOTS = new Map<string, Lot>(E05.lots.map((l) => [l.id, l]));

const run: RunOutput = runEvening(WX, E05, {
  policy: 'salo',
  params: UNTUNED_PARAMS,
  humanDrivers: new Set(['V19']),
  inputs: [
    { atMinute: 1031, input: { type: 'DRIVER_RESPONSE', driverId: 'V19', lotId: 'L0227', answer: 'offer' } as EngineInput },
    { atMinute: 1032, input: { type: 'DRIVER_RESPONSE', driverId: 'V19', lotId: 'L0227', answer: 'commit' } as EngineInput },
  ],
});

/** The donor D32's events as visible at `minute`. */
function donorAt(minute: number): NotifyEvent[] {
  return notifyEvents({
    role: 'donor',
    profileId: 'D32',
    log: run.log.filter((e) => e.atMinute <= minute),
    lots: LOTS,
    now: minute,
    wx: WX,
  });
}

const CTX = 'donor|D32|salo||o';

describe('announcing the donor D32 events once', () => {
  it('a clock that ticks through 1028 to 1049 announces each donor event exactly once, at its minute', () => {
    const tracker = new NotifyTracker();
    const announced: { kind: string; lot: string; at: number }[] = [];
    // The first look is the open: 1027 has nothing visible for this donor, so nothing is backlog.
    tracker.step(CTX, 1027, false, donorAt(1027));
    for (let m = 1028; m <= 1049; m++) {
      for (const e of tracker.step(CTX, m, false, donorAt(m))) {
        announced.push({ kind: e.kind, lot: e.lotId, at: e.atMinute });
      }
    }
    expect(announced).toEqual([
      { kind: 'donor_tentative', lot: 'L0227', at: 1028 },
      { kind: 'donor_commit', lot: 'L0227', at: 1032 },
      { kind: 'donor_tentative', lot: 'L0245', at: 1045 },
      { kind: 'donor_commit', lot: 'L0245', at: 1049 },
    ]);
  });

  it('a second look at the same minute announces nothing again', () => {
    const tracker = new NotifyTracker();
    tracker.step(CTX, 1027, false, donorAt(1027));
    expect(tracker.step(CTX, 1028, false, donorAt(1028))).toHaveLength(1);
    expect(tracker.step(CTX, 1028, false, donorAt(1028))).toEqual([]);
  });
});

describe('no backlog', () => {
  it('on open at 1040, the two events already visible are not announced', () => {
    const tracker = new NotifyTracker();
    expect(tracker.step(CTX, 1040, false, donorAt(1040))).toEqual([]);
    expect(tracker.seenCount).toBe(2);
  });

  it('after a join at 1040 (a new context), the visible events are not announced; the next minute announces only new ones', () => {
    const tracker = new NotifyTracker();
    tracker.step('donor|D32|salo|sess-1|o', 1038, false, donorAt(1038));
    expect(tracker.step('donor|D32|salo|sess-2|f', 1040, true, donorAt(1040))).toEqual([]);
    expect(tracker.step('donor|D32|salo|sess-2|f', 1046, true, donorAt(1046))).toHaveLength(1);
  });

  it('a scrub from 1040 to 1050 in one step on a single phone is not news', () => {
    const tracker = new NotifyTracker();
    tracker.step(CTX, 1040, false, donorAt(1040));
    expect(MAX_LIVE_STEP).toBe(3);
    expect(tracker.step(CTX, 1050, false, donorAt(1050))).toEqual([]);
    // Scrubbing back and forward again does not announce them either.
    tracker.step(CTX, 1030, false, donorAt(1030));
    expect(tracker.step(CTX, 1050, false, donorAt(1050))).toEqual([]);
  });

  it('a follower catching up after a lost connection is news (its clock follows the dashboard)', () => {
    const tracker = new NotifyTracker();
    const ctx = 'donor|D32|salo|sess-2|f';
    tracker.step(ctx, 1040, true, donorAt(1040));
    // The catch-up jumps 10 minutes: the two L0245 events at 1045 and 1049 arrived while the connection was down.
    const caught = tracker.step(ctx, 1050, true, donorAt(1050));
    expect(caught.map((e) => [e.kind, e.lotId, e.atMinute])).toEqual([
      ['donor_tentative', 'L0245', 1045],
      ['donor_commit', 'L0245', 1049],
    ]);
  });
});

describe('the same event is not announced twice across a re-run', () => {
  it('after the baseline run has announced the donor D32 L0227 tentative, the held run does not announce it again', () => {
    const baseline = runEvening(WX, E05, { policy: 'salo', params: UNTUNED_PARAMS, inputs: [] });
    const at = (r: RunOutput, m: number) =>
      notifyEvents({ role: 'donor', profileId: 'D32', log: r.log.filter((e) => e.atMinute <= m), lots: LOTS, now: m, wx: WX });
    const tracker = new NotifyTracker();
    tracker.step(CTX, 1027, false, at(baseline, 1027));
    const first = tracker.step(CTX, 1028, false, at(baseline, 1028));
    expect(first.map((e) => e.kind)).toEqual(['donor_tentative']);
    // The phone's run changes (the driver answers at 1031). The held run's events at 1028 are the same events.
    const again = tracker.step(CTX, 1029, false, at(run, 1029));
    expect(again).toEqual([]);
  });
});
