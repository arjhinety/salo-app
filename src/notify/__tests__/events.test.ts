/**
 * Notification triggers on real E05 runs (CC-12). Literal lot ids and minutes were read from the engine's own log:
 * the held-driver run of V19 who offers on L0227 at 1031 and commits at 1032 (ETA 1038), and the baseline with no inputs.
 * Times are shown as the screen shows them (clockText): minute 1031 is 5:11 PM.
 */
import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../../engine/params';
import { runEvening, type RunOutput } from '../../engine/simulate';
import type { EngineInput, LogEntry, Lot, Minute } from '../../engine/types';
import { indexWorld } from '../../engine/world';
import { notifyEvents, type NotifyEvent } from '../events';

const WX = indexWorld(WORLD);
const E05 = EVENINGS.find((e) => e.id === 'E05')!;
const LOTS = new Map<string, Lot>(E05.lots.map((l) => [l.id, l]));

type Answer = Extract<EngineInput, { type: 'DRIVER_RESPONSE' }>;
const answer = (atMinute: Minute, lotId: string, a: Answer['answer']): { atMinute: Minute; input: EngineInput } => ({
  atMinute,
  input: { type: 'DRIVER_RESPONSE', driverId: 'V19', lotId, answer: a },
});

/** V19 is held by this phone; it offers on L0227 at 1031 and commits at 1032. */
const heldRun = (): RunOutput =>
  runEvening(WX, E05, {
    policy: 'salo',
    params: UNTUNED_PARAMS,
    humanDrivers: new Set(['V19']),
    inputs: [answer(1031, 'L0227', 'offer'), answer(1032, 'L0227', 'commit')],
  });

const baselineRun = (): RunOutput => runEvening(WX, E05, { policy: 'salo', params: UNTUNED_PARAMS, inputs: [] });

function visible(run: RunOutput, minute: Minute): LogEntry[] {
  return run.log.filter((e) => e.atMinute <= minute);
}

function eventsFor(run: RunOutput, minute: Minute, role: 'donor' | 'pantry' | 'driver' | 'dashboard' | null, profileId: string | null) {
  return notifyEvents({ role, profileId, log: visible(run, minute), lots: LOTS, now: minute, wx: WX });
}

const pick = (events: readonly NotifyEvent[], kind: NotifyEvent['kind'], lotId: string) =>
  events.filter((e) => e.kind === kind && e.lotId === lotId);

describe('driver V19 on the held E05 run', () => {
  const run = heldRun();

  it('is asked on L0227 at 1031, and the request says reply before 5:14 PM', () => {
    const asks = pick(eventsFor(run, 1031, 'driver', 'V19'), 'driver_ask', 'L0227');
    expect(asks).toHaveLength(1);
    expect(asks[0]).toMatchObject({ atMinute: 1031, href: '/driver' });
    expect(asks[0].body).toContain('Lot L0227: sumagot bago ang 5:14 PM');
  });

  it('gets no ask before the minute it is asked', () => {
    expect(pick(eventsFor(run, 1030, 'driver', 'V19'), 'driver_ask', 'L0227')).toHaveLength(0);
  });
});

describe('donor D32 on the held E05 run', () => {
  const run = heldRun();

  it('is told L0227 is tentative with P19 at 1028 (5:08 PM)', () => {
    const [e] = pick(eventsFor(run, 1028, 'donor', 'D32'), 'donor_tentative', 'L0227');
    expect(e).toMatchObject({ atMinute: 1028, href: '/donor' });
    expect(e.body).toContain('Lot L0227: ');
  });

  it('is told the final COMMIT on L0227 by V19 at 1032 (ETA 5:18 PM), once', () => {
    const commits = pick(eventsFor(run, 1032, 'donor', 'D32'), 'donor_commit', 'L0227');
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ atMinute: 1032 });
    expect(commits[0].body).toContain('maghahatid si ');
    expect(commits[0].body).toContain('5:18 PM');
  });

  it('is told L0245 tentative at 1045 and committed by V34 at 1049 on this run', () => {
    const all = eventsFor(run, 1049, 'donor', 'D32');
    expect(pick(all, 'donor_tentative', 'L0245')).toHaveLength(1);
    expect(pick(all, 'donor_tentative', 'L0245')[0].atMinute).toBe(1045);
    const commit = pick(all, 'donor_commit', 'L0245');
    expect(commit).toHaveLength(1);
    expect(commit[0]).toMatchObject({ atMinute: 1049 });
    const v34 = WORLD.drivers.find((d) => d.id === 'V34')!.name;
    expect(commit[0].body).toContain(`maghahatid si ${v34}`);
  });

  it('is not told about lots of other donors', () => {
    const all = eventsFor(run, 1049, 'donor', 'D32');
    expect(all.every((e) => e.kind === 'donor_tentative' || e.kind === 'donor_commit')).toBe(true);
    expect(all.some((e) => e.lotId === 'L0207')).toBe(false);
  });
});

describe('pantry P19 and P07 on the held E05 run', () => {
  const run = heldRun();

  it('P19 is told L0227 is tentative at 1028 and final at 1032', () => {
    const all = eventsFor(run, 1032, 'pantry', 'P19');
    expect(pick(all, 'pantry_tentative', 'L0227').map((e) => e.atMinute)).toEqual([1028]);
    expect(pick(all, 'pantry_final', 'L0227').map((e) => e.atMinute)).toEqual([1032]);
    expect(pick(all, 'pantry_final', 'L0227')[0].href).toBe('/pantry/lot/L0227?profile=P19');
  });

  it('P07 is told L0245 is tentative at 1045 and final at 1049', () => {
    const all = eventsFor(run, 1049, 'pantry', 'P07');
    expect(pick(all, 'pantry_tentative', 'L0245').map((e) => e.atMinute)).toEqual([1045]);
    expect(pick(all, 'pantry_final', 'L0245').map((e) => e.atMinute)).toEqual([1049]);
  });

  it('a pantry is not told about a lot it did not win (P19 never hears of L0245 at 1049)', () => {
    const all = eventsFor(run, 1049, 'pantry', 'P19');
    expect(pick(all, 'pantry_tentative', 'L0245')).toHaveLength(0);
    expect(pick(all, 'pantry_final', 'L0245')).toHaveLength(0);
  });
});

describe('the dashboard and a phone with no role announce nothing', () => {
  it('dashboard: nothing, even on the run with every event', () => {
    expect(eventsFor(heldRun(), 1200, 'dashboard', null)).toEqual([]);
    expect(eventsFor(baselineRun(), 1200, 'dashboard', null)).toEqual([]);
  });

  it('no role: nothing', () => {
    expect(eventsFor(heldRun(), 1200, null, null)).toEqual([]);
  });

  it('a role with no profile id: nothing', () => {
    expect(eventsFor(heldRun(), 1200, 'donor', null)).toEqual([]);
  });
});

describe('the same event keeps its key across a re-run (seq is not used)', () => {
  it('the donor D32 tentative on L0227 has the same key in the baseline and in the held run', () => {
    const a = eventsFor(baselineRun(), 1030, 'donor', 'D32');
    const b = eventsFor(heldRun(), 1030, 'donor', 'D32');
    expect(pick(a, 'donor_tentative', 'L0227').map((e) => e.key)).toEqual(
      pick(b, 'donor_tentative', 'L0227').map((e) => e.key),
    );
  });

  it('the seq of the same DELIVERY of L0227 differs between the two runs, so seq cannot be the key', () => {
    const seqOf = (run: RunOutput) =>
      run.log.find((e) => e.event.type === 'DELIVERY' && e.event.lotId === 'L0227')!.seq;
    expect(seqOf(baselineRun())).toBe(202);
    expect(seqOf(heldRun())).toBe(200);
  });
});
