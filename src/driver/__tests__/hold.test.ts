/**
 * LiveEvening.holdDriver (decision D-Q5): the live evening runs with the held driver, and releasing it gives the
 * simulated evening back. Uses the same live store the driver screen uses, with its real answer path.
 */
import { WORLD } from '../../data/dataset';
import { indexWorld } from '../../engine/world';
import { LiveEvening } from '../../live/evening';
import { driverBoard } from '../board';

const V19 = WORLD.drivers.find((d) => d.id === 'V19')!;
const WX = indexWorld(WORLD);

function boardOf(live: LiveEvening) {
  const snap = live.getSnapshot();
  const lots = new Map(live.postedLots().map((l) => [l.id, l]));
  return driverBoard({ log: live.visibleLog(), driver: V19, wx: WX, lots, now: snap.minute });
}

describe('holdDriver on the live evening', () => {
  it('asks the held driver in the rounds before the clock, and the engine proposes for nobody else', () => {
    const live = new LiveEvening();
    live.holdDriver('V19');
    live.seek(1040);
    const board = boardOf(live);
    expect(board.asks.map((a) => [a.lot.id, a.askedMinute])).toEqual([
      ['L0207', 1030],
      ['L0227', 1031],
      ['L0242', 1036],
    ]);
  });

  it('a person can offer, commit and see the delivery through the live store', () => {
    const live = new LiveEvening();
    live.holdDriver('V19');
    live.seek(1031);
    live.answerDriver('L0227', 'V19', 'offer');
    live.seek(1032);
    live.answerDriver('L0227', 'V19', 'commit');
    live.seek(1038);
    const ask = boardOf(live).asks.find((a) => a.lot.id === 'L0227')!;
    expect(ask).toMatchObject({ status: 'delivered', commitMinute: 1032, commitEtaMinute: 1038, deliveredMinute: 1038, onTime: true });
  });

  it('releasing the driver gives back the simulated evening, where the engine proposes for V19 itself', () => {
    const live = new LiveEvening();
    live.holdDriver('V19');
    live.seek(1031);
    live.holdDriver(null);
    const proposedAt1031 = live.visibleLog().some(
      (e) => e.atMinute === 1031 && e.event.type === 'MESSAGE' && e.event.message.type === 'PROPOSE' &&
        e.event.message.proposer === 'driver' && e.event.message.driverId === 'V19',
    );
    expect(proposedAt1031).toBe(true);
  });

  it('holding the same driver again does not republish', () => {
    const live = new LiveEvening();
    live.holdDriver('V19');
    const rev = live.getSnapshot().revision;
    live.holdDriver('V19');
    expect(live.getSnapshot().revision).toBe(rev);
  });
});
