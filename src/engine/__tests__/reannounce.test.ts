import { EVENINGS, WORLD } from '../../data/dataset';
import { DRIVER_REPLY_DELAY_MAX_MIN, UNTUNED_PARAMS } from '../params';
import { POLICY_IDS } from '../policies';
import { STREAM, intBelow } from '../rng';
import { runEvening } from '../simulate';
import type { LogEntry } from '../types';
import { indexWorld } from '../world';

// Decision "Driver reply delay" (2026-10-13): every re-announcement after a driver FAILURE waits
// 1..DRIVER_REPLY_DELAY_MAX_MIN whole minutes before its driver round. The draw is keyed by (evening seed,
// lot index, re-announcement number r): r = 1 for the first FAILURE of the lot, 2 for the second, and so on.

const wx = indexWorld(WORLD);
const tuning = EVENINGS.filter((e) => e.split === 'tuning');
const evening = (id: string) => EVENINGS.find((e) => e.id === id)!;
const NEVER_SHOWS = Object.fromEntries(WORLD.drivers.map((d) => [d.id, 0]));
const lotIndex = (lotId: string) => Number(/^L(\d+)$/.exec(lotId)![1]);
/** The delay of re-announcement r for a lot, as the engine draws it. */
const drawn = (seed: number, r: number, lotId: string) =>
  1 + intBelow(DRIVER_REPLY_DELAY_MAX_MIN, seed, STREAM.driverReply, r, lotIndex(lotId));

type Ev = LogEntry['event'];
const msgType = (e: LogEntry) => (e.event.type === 'MESSAGE' ? e.event.message.type : null);
const reasonOf = (e: LogEntry) => (e.event.type === 'MESSAGE' && e.event.message.type === 'FAILURE' ? e.event.message.reason : null);
const lotOf = (ev: Ev): string | null =>
  ev.type === 'MESSAGE' ? ev.message.lotId : ev.type === 'AWARD_STATE' ? ev.lotId : null;
const isFailure = (e: LogEntry, lotId: string) =>
  msgType(e) === 'FAILURE' && lotOf(e.event) === lotId;
const isDriverRound = (e: LogEntry, lotId: string) =>
  e.event.type === 'MESSAGE' && e.event.message.type === 'CALL_FOR_PROPOSALS' &&
  e.event.message.target === 'driver' && e.event.message.lotId === lotId;
const cancel = (lotId: string, atMinute: number) => ({ atMinute, input: { type: 'CANCEL_DRIVER' as const, lotId } });

describe('re-announcement after a driver failure waits the reply delay', () => {
  it('operator cancel on E05: L0207 is re-announced 3 minutes later, and it is TENTATIVE in between', () => {
    const ev = evening('E05');
    const delay = drawn(ev.seed, 1, 'L0207');
    expect(delay).toBe(3);
    const { log } = runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS, inputs: [cancel('L0207', 1030)] });
    const i = log.findIndex((e) => isFailure(e, 'L0207'));
    expect(log[i].atMinute).toBe(1030);
    expect(reasonOf(log[i])).toBe('cancelled_by_operator');
    // The first AWARD_STATE after the FAILURE is 'tentative' (the pantry keeps its award).
    const after = log.slice(i + 1).find((e) => e.event.type === 'AWARD_STATE' && e.event.lotId === 'L0207')!;
    expect(after.event).toEqual({ type: 'AWARD_STATE', lotId: 'L0207', state: 'tentative' });
    expect(after.atMinute).toBe(1030);
    // The next driver round, the next PROPOSE from a driver and the next COMMIT are all at 1030 + delay.
    const round = log.slice(i + 1).find((e) => isDriverRound(e, 'L0207'))!;
    expect(round.atMinute).toBe(1030 + delay);
    expect(round.atMinute).toBe(1033);
    const nextDriverMsg = log.slice(i + 1).find((e) =>
      e.event.type === 'MESSAGE' && lotOf(e.event) === 'L0207' &&
      (e.event.message.type === 'COMMIT' || (e.event.message.type === 'PROPOSE' && e.event.message.proposer === 'driver')))!;
    expect(nextDriverMsg.atMinute).toBe(1030 + delay);
    const commit = log.slice(i + 1).find((e) => msgType(e) === 'COMMIT' && lotOf(e.event) === 'L0207')!;
    expect(commit.atMinute).toBe(1033);
  });

  it('withdrew_before_commit on E01: L0005 withdraws at 1086 and is re-announced at 1089 (r = 1, delay 3)', () => {
    const ev = evening('E01');
    const { log } = runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS });
    const i = log.findIndex((e) => isFailure(e, 'L0005'));
    const fail = log[i];
    expect(fail.atMinute).toBe(1086);
    expect(reasonOf(fail)).toBe('withdrew_before_commit');
    // A withdrawal emits no AWARD_STATE: the lot was already 'tentative' since 1084 and stays so until the commit.
    const lastStateBefore = [...log.slice(0, i)].reverse().find((e) => e.event.type === 'AWARD_STATE' && e.event.lotId === 'L0005')!;
    expect(lastStateBefore.event).toEqual({ type: 'AWARD_STATE', lotId: 'L0005', state: 'tentative' });
    const between = log.slice(i + 1).filter((e) => e.event.type === 'AWARD_STATE' && e.event.lotId === 'L0005');
    expect(between.map((e) => `${e.atMinute}:${e.event.type === 'AWARD_STATE' ? e.event.state : ''}`)).toEqual(['1089:final', '1103:delivered']);
    const round = log.slice(i + 1).find((e) => isDriverRound(e, 'L0005'))!;
    expect(round.atMinute - fail.atMinute).toBe(drawn(ev.seed, 1, 'L0005'));
    expect(round.atMinute).toBe(1089);
  });

  it('a second re-announcement of the same lot uses counter 2 (E01, L0005: withdrawal, then a cancel at its re-commit)', () => {
    const ev = evening('E01');
    const base = runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS });
    const recommit = base.log.find((e) => e.atMinute > 1086 && msgType(e) === 'COMMIT' && lotOf(e.event) === 'L0005')!;
    expect(recommit.atMinute).toBe(1089);
    // Draws for L0005: r = 1 gives 3 and r = 2 gives 2, so a counter bug would show here.
    expect(drawn(ev.seed, 1, 'L0005')).toBe(3);
    expect(drawn(ev.seed, 2, 'L0005')).toBe(2);
    const { log } = runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS, inputs: [cancel('L0005', recommit.atMinute)] });
    const fails = log.filter((e) => isFailure(e, 'L0005'));
    expect(fails.map((e) => e.atMinute)).toEqual([1086, 1089]);
    const rounds = log.filter((e) => isDriverRound(e, 'L0005')).map((e) => e.atMinute);
    expect(rounds).toEqual([1086, 1089, 1091]);
    expect(rounds[2] - fails[1].atMinute).toBe(2);
    const commits = log.filter((e) => msgType(e) === 'COMMIT' && lotOf(e.event) === 'L0005').map((e) => e.atMinute);
    expect(commits).toEqual([1089, 1091]);
  });

  it('a CANCEL_DRIVER while the re-announcement is pending is ignored (no second FAILURE, the round still runs at 1033)', () => {
    const ev = evening('E05');
    const once = runEvening(wx, ev, { policy: 'salo', params: UNTUNED_PARAMS, inputs: [cancel('L0207', 1030)] });
    const thrice = runEvening(wx, ev, {
      policy: 'salo', params: UNTUNED_PARAMS,
      inputs: [cancel('L0207', 1030), cancel('L0207', 1031), cancel('L0207', 1032)],
    });
    const failures = thrice.log.filter((e) => isFailure(e, 'L0207'));
    expect(failures).toHaveLength(1);
    expect(failures[0].atMinute).toBe(1030);
    const states = thrice.log.filter((e) => e.event.type === 'AWARD_STATE' && e.event.lotId === 'L0207' && e.atMinute >= 1030);
    // 1030: the commit's 'final' comes first, then the one cancel's 'tentative'; the two ignored cancels add nothing.
    expect(states.map((e) => (e.event.type === 'AWARD_STATE' ? `${e.atMinute}:${e.event.state}` : ''))).toEqual(['1030:final', '1030:tentative', '1033:final', '1045:delivered']);
    // The lot's own events after 1030 are the same as with the single cancel.
    const own = (log: readonly LogEntry[]) => log.filter((e) => e.atMinute >= 1030 && (lotOf(e.event) === 'L0207') && e.event.type !== 'INPUT')
      .map((e) => JSON.stringify(e.event));
    expect(own(thrice.log)).toEqual(own(once.log));
    // The ignored inputs are still in the log, so a replay shows them.
    expect(thrice.log.filter((e) => e.event.type === 'INPUT').map((e) => e.atMinute)).toEqual([1030, 1031, 1032]);
  });

  it('a live-level check: E05, salo, Cancel driver on L0207 at 1030 leaves it TENTATIVE at 1030 and FINAL again at 1033', () => {
    const { log } = runEvening(wx, evening('E05'), { policy: 'salo', params: UNTUNED_PARAMS, inputs: [cancel('L0207', 1030)] });
    const states = log.filter((e) => e.event.type === 'AWARD_STATE' && e.event.lotId === 'L0207');
    const at1030 = states.filter((e) => e.atMinute === 1030);
    // Last AWARD_STATE at minute 1030: the cancel's 'tentative' (after the commit's 'final' at 1030).
    expect(at1030.map((e) => (e.event.type === 'AWARD_STATE' ? e.event.state : ''))).toEqual(['final', 'tentative']);
    const finalAgain = states.find((e) => e.atMinute > 1030 && e.event.type === 'AWARD_STATE' && e.event.state === 'final')!;
    expect(finalAgain.atMinute).toBe(1033);
    expect(states.filter((e) => e.atMinute > 1030 && e.atMinute < 1033)).toHaveLength(0);
  });

  it.each(POLICY_IDS)('%s: every failure is followed by its driver round after the drawn delay for that failure number', (policy) => {
    let checked = 0;
    for (const ev of tuning) {
      const { log } = runEvening(wx, ev, { policy, params: UNTUNED_PARAMS, trueShowRate: NEVER_SHOWS });
      const count = new Map<string, number>();
      log.forEach((e, i) => {
        if (msgType(e) !== 'FAILURE') return;
        const lotId = lotOf(e.event)!;
        const r = (count.get(lotId) ?? 0) + 1;
        count.set(lotId, r);
        const next = log.slice(i + 1).find((x) => isDriverRound(x, lotId));
        expect(next).toBeDefined();
        expect(next!.atMinute - e.atMinute).toBe(drawn(ev.seed, r, lotId));
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it.each(POLICY_IDS)('%s: with replyDelayMaxMin 0 every failure is re-announced in the same minute (pre-delay behaviour)', (policy) => {
    let checked = 0;
    for (const ev of tuning) {
      const { log } = runEvening(wx, ev, { policy, params: UNTUNED_PARAMS, trueShowRate: NEVER_SHOWS, replyDelayMaxMin: 0 });
      log.forEach((e, i) => {
        if (msgType(e) !== 'FAILURE') return;
        const next = log.slice(i + 1).find((x) => isDriverRound(x, lotOf(e.event)!));
        expect(next!.atMinute).toBe(e.atMinute);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('with replyDelayMaxMin 0 the E05 cancel is re-announced, re-committed and final in the same minute 1030', () => {
    const { log } = runEvening(wx, evening('E05'), { policy: 'salo', params: UNTUNED_PARAMS, replyDelayMaxMin: 0, inputs: [cancel('L0207', 1030)] });
    const i = log.findIndex((e) => isFailure(e, 'L0207'));
    expect(log[i].atMinute).toBe(1030);
    expect(log.slice(i + 1).find((e) => isDriverRound(e, 'L0207'))!.atMinute).toBe(1030);
    expect(log.slice(i + 1).find((e) => msgType(e) === 'COMMIT' && lotOf(e.event) === 'L0207')!.atMinute).toBe(1030);
  });
});
