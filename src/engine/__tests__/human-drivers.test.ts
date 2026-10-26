import { createHash } from 'crypto';
import { EVENINGS, WORLD } from '../../data/dataset';
import { UNTUNED_PARAMS } from '../params';
import { POLICY_IDS } from '../policies';
import * as rng from '../rng';
import { STREAM } from '../rng';
import { runEvening, type RunOutput } from '../simulate';
import type { DriverAnswer, DriverId, LogEntry } from '../types';
import { indexWorld } from '../world';
import fixture from './fixtures/head-digests.json';

// Decision D-Q5: people hold driver profiles on the phone. Tuning evenings only; every expected value below was read
// from a run and written by hand.

const wx = indexWorld(WORLD);
const evening = (id: string) => EVENINGS.find((e) => e.id === id)!;
const tuning = EVENINGS.filter((e) => e.split === 'tuning');
const E05 = evening('E05');
const LOT = 'L0227'; // E05: posted 1023, pantry award 1028, first driver round 1031
const HELD = 'V19'; // wins this round when it offers at once
const digest = (out: RunOutput) =>
  createHash('sha256').update(JSON.stringify({ log: out.log, result: out.result, driverRuleStats: out.driverRuleStats })).digest('hex');
const answer = (atMinute: number, driverId: DriverId, lotId: string, a: DriverAnswer) => ({
  atMinute, input: { type: 'DRIVER_RESPONSE' as const, driverId, lotId, answer: a },
});

/** The driver side of one lot: minute and label. Offers appear only for the drivers in `watch`. */
function driverTape(log: readonly LogEntry[], lotId: string, watch: readonly DriverId[] = []): [number, string][] {
  const out: [number, string][] = [];
  for (const { atMinute: m, event: x } of log) {
    if (x.type === 'MESSAGE' && x.message.lotId === lotId) {
      const msg = x.message;
      if (msg.type === 'CALL_FOR_PROPOSALS' && msg.target === 'driver') out.push([m, 'CFP driver']);
      else if (msg.type === 'PROPOSE' && msg.proposer === 'driver' && watch.includes(msg.driverId)) out.push([m, `PROPOSE ${msg.driverId} eta ${msg.etaMinute}`]);
      else if (msg.type === 'COMMIT') out.push([m, `COMMIT ${msg.driverId} eta ${msg.etaMinute}`]);
      else if (msg.type === 'FAILURE') out.push([m, `FAILURE ${msg.driverId} ${msg.reason}`]);
    } else if (x.type === 'INPUT' && x.input.type === 'DRIVER_RESPONSE' && x.input.lotId === lotId) {
      out.push([m, `INPUT ${x.input.answer} ${x.input.driverId}`]);
    } else if (x.type === 'AWARD_STATE' && x.lotId === lotId && x.state !== 'announced' && x.state !== 'unawarded') {
      out.push([m, `STATE ${x.state}`]);
    } else if (x.type === 'DELIVERY' && x.lotId === lotId) {
      out.push([m, `DELIVERY ${x.driverId} onTime ${x.onTime}`]);
    }
  }
  return out;
}

const reliabilityOf = (log: readonly LogEntry[], driverId: DriverId) =>
  log.filter((e) => e.event.type === 'RELIABILITY_UPDATED' && e.event.driverId === driverId)
    .map((e) => (e.event.type === 'RELIABILITY_UPDATED' ? [e.atMinute, e.event.shows, e.event.runs] : []));

describe('held driver profiles: the engine without them is unchanged (decision D-Q5)', () => {
  it('E01-E10 x four policies: digests of log, result and rule stats equal the HEAD fixture, with humanDrivers absent or empty', () => {
    expect(Object.keys(fixture.digests)).toHaveLength(40);
    for (const ev of tuning) {
      for (const policy of POLICY_IDS) {
        for (const humanDrivers of [undefined, new Set<DriverId>()]) {
          const out = runEvening(wx, ev, { policy, params: UNTUNED_PARAMS, humanDrivers });
          expect(digest(out)).toBe(fixture.digests[`${ev.id}/${policy}` as keyof typeof fixture.digests]);
        }
      }
    }
  });

  it('a held driver who is never chosen and declines at once leaves the simulated outcomes unchanged (V02 on E05)', () => {
    const base = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS });
    const hv = 'V02';
    expect(base.log.some((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'COMMIT' && e.event.message.driverId === hv)).toBe(false);
    // Asked in every round where V02 offered in the baseline, at that same minute, so no round moves in time.
    const inputs = base.log
      .filter((e) => e.event.type === 'MESSAGE' && e.event.message.type === 'PROPOSE' && e.event.message.proposer === 'driver' && e.event.message.driverId === hv)
      .map((e) => answer(e.atMinute, hv, (e.event as { message: { lotId: string } }).message.lotId, 'decline'));
    expect(inputs.length).toBeGreaterThan(0);
    const run = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: new Set([hv]), inputs });
    // Every COMMIT, FAILURE, DELIVERY and reliability update has the same minute and content. Not the whole log: a
    // round that decides on an answer comes after the other events of its minute, so a same-minute pantry reply can
    // read a driver one step later (seen on E05, L0241, 1049). The outcomes are the same.
    const outcomes = (log: readonly LogEntry[]) => log
      .filter((e) => e.event.type === 'DELIVERY' || e.event.type === 'RELIABILITY_UPDATED' ||
        (e.event.type === 'MESSAGE' && (e.event.message.type === 'COMMIT' || e.event.message.type === 'FAILURE')))
      .map((e) => JSON.stringify([e.atMinute, e.event]));
    expect(outcomes(run.log)).toEqual(outcomes(base.log));
    expect(run.result).toEqual(base.result);
  });

  it('a held driver who is picked draws nothing for its own outcome (no driverOutcome or lateMinutes draw for its index)', () => {
    const idx = WORLD.drivers.findIndex((d) => d.id === HELD);
    const lotIdx = Number(LOT.slice(1));
    const drawsFor = (run: () => unknown) => {
      const spy = jest.spyOn(rng, 'u01');
      try {
        run();
        return spy.mock.calls.filter(([, stream, a, b]) => (stream === STREAM.driverOutcome || stream === STREAM.lateMinutes) && a === idx && b === lotIdx).length;
      } finally {
        spy.mockRestore();
      }
    };
    // The baseline draws for this driver on this lot; the held run does not.
    expect(drawsFor(() => runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS }))).toBeGreaterThan(0);
    expect(drawsFor(() => runEvening(wx, E05, {
      policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: new Set([HELD]),
      inputs: [answer(1031, HELD, LOT, 'offer'), answer(1032, HELD, LOT, 'commit')],
    }))).toBe(0);
  });
});

describe('held driver profiles on E05 under salo (decision D-Q5)', () => {
  const held = new Set([HELD]);

  it('(a) offer at 1031, chosen, commit at 1032: COMMIT at 1032 and DELIVERY at the ETA 1038, no lateness', () => {
    const { log } = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: held,
      inputs: [answer(1031, HELD, LOT, 'offer'), answer(1032, HELD, LOT, 'commit')] });
    expect(driverTape(log, LOT, [HELD])).toEqual([
      [1028, 'STATE tentative'],
      [1031, 'CFP driver'],
      [1031, 'INPUT offer V19'],
      [1031, 'PROPOSE V19 eta 1038'],
      [1032, 'INPUT commit V19'],
      [1032, 'COMMIT V19 eta 1038'],
      [1032, 'STATE final'],
      [1038, 'DELIVERY V19 onTime true'],
      [1038, 'STATE delivered'],
    ]);
    expect(reliabilityOf(log, HELD)).toEqual([[1038, 7, 7]]);
  });

  it('(a2) a withdraw after COMMIT is ignored: the run is still delivered at 1038', () => {
    const { log } = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: held,
      inputs: [answer(1031, HELD, LOT, 'offer'), answer(1032, HELD, LOT, 'commit'), answer(1033, HELD, LOT, 'withdraw')] });
    expect(driverTape(log, LOT, [HELD])).toEqual([
      [1028, 'STATE tentative'],
      [1031, 'CFP driver'],
      [1031, 'INPUT offer V19'],
      [1031, 'PROPOSE V19 eta 1038'],
      [1032, 'INPUT commit V19'],
      [1032, 'COMMIT V19 eta 1038'],
      [1032, 'STATE final'],
      [1033, 'INPUT withdraw V19'],
      [1038, 'DELIVERY V19 onTime true'],
      [1038, 'STATE delivered'],
    ]);
  });

  it('a second offer from the same person is a duplicate: logged, not proposed again', () => {
    const { log } = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: held,
      inputs: [answer(1031, HELD, LOT, 'offer'), answer(1031, HELD, LOT, 'offer'), answer(1032, HELD, LOT, 'commit')] });
    const tape = driverTape(log, LOT, [HELD]);
    expect(tape.filter(([, s]) => s.startsWith('PROPOSE V19'))).toEqual([[1031, 'PROPOSE V19 eta 1038']]);
    expect(tape.filter(([, s]) => s === 'INPUT offer V19')).toHaveLength(2);
    expect(tape.filter(([, s]) => s.startsWith('COMMIT'))).toEqual([[1032, 'COMMIT V19 eta 1038']]);
  });

  it('(b) silence: V01 is excluded for L0207 and the round selects at 1033 with the simulated offers', () => {
    const { log } = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: new Set(['V01']) });
    expect(driverTape(log, 'L0207', ['V01'])).toEqual([
      [1028, 'STATE tentative'],
      [1030, 'CFP driver'],
      [1033, 'COMMIT V07 eta 1045'],
      [1033, 'STATE final'],
      [1066, 'DELIVERY V07 onTime false'],
      [1066, 'STATE delivered'],
    ]);
    // Silence is a decline, not a missed run: no FAILURE and no reliability change for V01.
    expect(reliabilityOf(log, 'V01').filter(([m]) => m <= 1033)).toEqual([]);
  });

  it('(e) an answer after the window closed (V01 at 1034, window closed at 1033) is logged and ignored', () => {
    const silent = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: new Set(['V01']) });
    const late = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: new Set(['V01']),
      inputs: [answer(1034, 'V01', 'L0207', 'offer')] });
    expect(driverTape(late.log, 'L0207', ['V01'])).toEqual([
      [1028, 'STATE tentative'],
      [1030, 'CFP driver'],
      [1033, 'COMMIT V07 eta 1045'],
      [1033, 'STATE final'],
      [1034, 'INPUT offer V01'],
      [1066, 'DELIVERY V07 onTime false'],
      [1066, 'STATE delivered'],
    ]);
    const rest = (log: readonly LogEntry[]) => log.filter((e) => e.event.type !== 'INPUT').map((e) => JSON.stringify([e.atMinute, e.event]));
    expect(rest(late.log)).toEqual(rest(silent.log));
  });

  it('(c) offer at 1031 and chosen, withdraw at 1032: FAILURE withdrew_before_commit, a missed run, re-announced at 1035', () => {
    const { log } = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: held,
      inputs: [answer(1031, HELD, LOT, 'offer'), answer(1032, HELD, LOT, 'withdraw')] });
    expect(driverTape(log, LOT, [HELD])).toEqual([
      [1028, 'STATE tentative'],
      [1031, 'CFP driver'],
      [1031, 'INPUT offer V19'],
      [1031, 'PROPOSE V19 eta 1038'],
      [1032, 'INPUT withdraw V19'],
      [1032, 'FAILURE V19 withdrew_before_commit'],
      [1035, 'CFP driver'],
      [1035, 'COMMIT V34 eta 1043'],
      [1035, 'STATE final'],
      [1043, 'DELIVERY V34 onTime true'],
      [1043, 'STATE delivered'],
    ]);
    // 6 shows in 7 runs: a missed run, the same count as a simulated withdrawal (DRV-04).
    expect(reliabilityOf(log, HELD)).toEqual([[1032, 6, 7]]);
    // Excluded for this lot: V19 is never offered again on L0227.
    expect(driverTape(log, LOT, [HELD]).filter(([m, s]) => m > 1032 && s.startsWith('PROPOSE V19'))).toEqual([]);
  });

  it('(d) offer at 1031 and chosen, no COMMIT: FAILURE no_reply at 1034 (selection + 3), re-announced at 1037', () => {
    const { log } = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: held,
      inputs: [answer(1031, HELD, LOT, 'offer')] });
    expect(driverTape(log, LOT, [HELD])).toEqual([
      [1028, 'STATE tentative'],
      [1031, 'CFP driver'],
      [1031, 'INPUT offer V19'],
      [1031, 'PROPOSE V19 eta 1038'],
      [1034, 'FAILURE V19 no_reply'],
      [1037, 'CFP driver'],
      [1037, 'COMMIT V34 eta 1045'],
      [1037, 'STATE final'],
      [1045, 'DELIVERY V34 onTime true'],
      [1045, 'STATE delivered'],
    ]);
  });

  it('(d2) a COMMIT that comes after the window (1035, window ends 1034) is logged and ignored', () => {
    const { log } = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: held,
      inputs: [answer(1031, HELD, LOT, 'offer'), answer(1035, HELD, LOT, 'commit')] });
    const tape = driverTape(log, LOT, [HELD]);
    expect(tape.filter(([, s]) => s.startsWith('COMMIT V19'))).toEqual([]);
    expect(tape).toContainEqual([1034, 'FAILURE V19 no_reply']);
    expect(tape).toContainEqual([1035, 'INPUT commit V19']);
  });

  it('a decline at once is not a missed run: the round selects at 1031 and V19 has no FAILURE or reliability change', () => {
    const { log } = runEvening(wx, E05, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: held,
      inputs: [answer(1031, HELD, LOT, 'decline')] });
    const tape = driverTape(log, LOT, [HELD]);
    expect(tape).toEqual([
      [1028, 'STATE tentative'],
      [1031, 'CFP driver'],
      [1031, 'INPUT decline V19'],
      [1031, 'COMMIT V34 eta 1039'],
      [1031, 'STATE final'],
      [1039, 'DELIVERY V34 onTime true'],
      [1039, 'STATE delivered'],
    ]);
    expect(reliabilityOf(log, HELD)).toEqual([]);
  });
});

describe('evaluation guard (decision D-Q5)', () => {
  it.each(['pilot', 'main_sample'] as const)('refuses held drivers on a %s evening before any simulation', (split) => {
    // A copy of tuning evening E05 relabelled: nothing is simulated, the guard throws first.
    const notTuning = { ...E05, id: 'E99', split };
    expect(() => runEvening(wx, notTuning, { policy: 'salo', params: UNTUNED_PARAMS, humanDrivers: new Set([HELD]) }))
      .toThrow('held driver profiles are only allowed on tuning evenings');
  });
});
