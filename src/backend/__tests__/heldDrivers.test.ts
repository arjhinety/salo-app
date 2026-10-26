/**
 * Held drivers (M5, test 3 of the brief): set only at 17:00 with the clock stopped, fixed once the evening has started,
 * read by the followers from the session row, and a driver phone that joins after the start is watch-only.
 */
import { LiveEvening } from '../../live/evening';
import { DashboardSession } from '../dashboardSession';
import { Follower } from '../follower';
import { answerRequest } from '../requests';
import { FakeSessionBus } from './fakeSessionBus';

const T0 = Date.UTC(2026, 9, 26, 12, 0, 0);
const CODE = 'HELD01';

async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

function setup(rosterVisible: boolean) {
  const bus = new FakeSessionBus();
  bus.rosterVisible = rosterVisible;
  bus.registerDevice('dash', 'dashboard', null);
  bus.registerDevice('driver', 'driver', 'V19');
  bus.registerDevice('driver2', 'driver', 'V21');
  const ref = { now: T0 };
  const now = () => ref.now;
  const live = new LiveEvening();
  const dashboard = new DashboardSession({ api: bus.api('dash'), live, now, isoNow: () => new Date(ref.now).toISOString() });
  dashboard.start();
  const session = bus.createSession('dash', { code: CODE, now: T0 });
  dashboard.onRun({ id: session.id, userId: 'dash', synced: true });
  const join = (userId: string) => {
    const l = new LiveEvening();
    const f = new Follower({ api: bus.api(userId), live: l, registered: () => true, userId: () => userId, now });
    return { live: l, f };
  };
  return { bus, ref, live, dashboard, session, join };
}

describe('held drivers', () => {
  test('they can be set only at 17:00 with the clock stopped', () => {
    const { live } = setup(false);
    expect(live.setSessionHeld(['V19']).ok).toBe(true);
    live.seek(1031);
    const midEvening = live.setSessionHeld(['V21']);
    expect(midEvening.ok).toBe(false);
    expect(midEvening.ok ? [] : midEvening.problems).toEqual(['held drivers can be set only at 5:00 PM with the clock stopped']);
    expect(live.heldDrivers()).toEqual(['V19']);
  });

  test('a start on the dashboard fixes the set: a later change is refused, and a rewind does not reopen it', () => {
    const { live } = setup(false);
    live.setSessionHeld(['V19']);
    live.start(T0);
    live.pause(T0 + 1000);
    live.seek(1020);
    const r = live.setSessionHeld(['V21']);
    expect(r.ok).toBe(false);
    expect(r.ok ? [] : r.problems).toEqual(['held drivers are fixed once the evening has started']);
    expect(live.heldDrivers()).toEqual(['V19']);
  });

  test('the dashboard writes the held set to the session row, once per change', async () => {
    const { bus, dashboard, session } = setup(false);
    expect(dashboard.setHeldDrivers(['V19']).ok).toBe(true);
    expect(dashboard.setHeldDrivers(['V19']).ok).toBe(true);
    await settle();
    expect(bus.row(session.id).heldDrivers).toEqual(['V19']);
    expect(bus.accepted.filter((a) => a.startsWith('held:'))).toEqual(['held:V19']);
  });

  test('from the roster: under the current rules the creator cannot read the members, so no driver is held', async () => {
    const { bus, dashboard, session, join } = setup(false);
    const driver = join('driver');
    driver.f.join(CODE);
    await driver.f.pass();
    await settle();
    await dashboard.pass();
    await settle();
    expect(bus.row(session.id).heldDrivers).toEqual([]);
  });

  test('from the roster, when the members are readable: at 17:00 stopped the joined driver is held', async () => {
    const { bus, dashboard, session, live, join } = setup(true);
    const driver = join('driver');
    driver.f.join(CODE);
    await driver.f.pass();
    await settle();
    await dashboard.pass();
    await settle();
    expect(bus.row(session.id).heldDrivers).toEqual(['V19']);
    expect(live.heldDrivers()).toEqual(['V19']);
  });

  test('a driver phone that joins after the start is watch-only; its own answer for an unheld profile is refused', async () => {
    const { bus, ref, live, dashboard, session, join } = setup(true);
    expect(dashboard.setHeldDrivers(['V19']).ok).toBe(true);
    live.start(T0);
    live.tick(T0 + 60_000);
    live.pause(T0 + 60_000);
    await dashboard.pass();
    await settle();
    ref.now = T0 + 61_000;
    const late = join('driver2');
    late.f.join(CODE);
    await late.f.pass();
    await settle();
    expect(late.f.getStatus().state).toBe('live');
    expect(late.f.getStatus().watchOnly).toBe(true);
    expect(late.live.heldDrivers()).toEqual(['V19']);
    late.f.send(answerRequest('L0227', 'V21', 'offer'));
    await late.f.pass();
    await dashboard.pass();
    await settle();
    await late.f.pass();
    await settle();
    expect(bus.requestsOf(session.id)[0].reason).toBe('driver V21 is not held in this session');
  });

  test('a driver phone that joined before the start is not watch-only', async () => {
    const { session, dashboard, join } = setup(true);
    const early = join('driver');
    early.f.join(CODE);
    await early.f.pass();
    await settle();
    expect(early.f.getStatus().watchOnly).toBe(false);
    expect(early.f.getStatus().sessionId).toBe(session.id);
    expect(dashboard.getStatus().sessionId).toBe(session.id);
  });
});
