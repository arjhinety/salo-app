/**
 * Two-phone sync on a fake bus (M5, tests 1 of the brief). A dashboard LiveEvening and follower LiveEvenings on E05 run
 * the real DashboardSession and Follower code against FakeSessionBus. After each step the visible logs must be identical
 * at the same minute, and the followers must never use their own inputs.
 */
import { CATALOG } from '../../donor/catalog';
import { lotItemFor } from '../../donor/postForm';
import { LiveEvening, type LiveLotDraft } from '../../live/evening';
import { DashboardSession } from '../dashboardSession';
import { Follower, type FollowStatus } from '../follower';
import { answerRequest, lotRequest } from '../requests';
import { digestOf, FakeSessionBus } from './fakeSessionBus';

const T0 = Date.UTC(2026, 9, 26, 12, 0, 0);
const CODE = 'K7Q2ZP';

/** A fixed, shared time source: each phone reads the same `ref.now`. */
function timeSource() {
  const ref = { now: T0 };
  return {
    ref,
    now: () => ref.now,
    isoNow: () => new Date(ref.now).toISOString(),
    advance(ms: number) {
      ref.now += ms;
    },
  };
}

/** Lets queued promises (the dashboard's writes and the follower's reads) finish. */
async function settle(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

function setup() {
  const bus = new FakeSessionBus();
  bus.registerDevice('dash', 'dashboard', null);
  bus.registerDevice('donor', 'donor', 'D01');
  bus.registerDevice('driver', 'driver', 'V19');
  bus.registerDevice('driver2', 'driver', 'V21');
  bus.registerDevice('pantry', 'pantry', 'P01');
  const time = timeSource();
  const live = new LiveEvening();
  const dashboard = new DashboardSession({ api: bus.api('dash'), live, now: time.now, isoNow: time.isoNow });
  dashboard.start();
  const session = bus.createSession('dash', { code: CODE, now: T0 });
  dashboard.onRun({ id: session.id, userId: 'dash', synced: true });
  return { bus, time, live, dashboard, session };
}

interface Phone {
  userId: string;
  live: LiveEvening;
  follower: Follower;
}

function phone(bus: FakeSessionBus, time: ReturnType<typeof timeSource>, userId: string): Phone {
  const live = new LiveEvening();
  const follower = new Follower({
    api: bus.api(userId),
    live,
    registered: () => true,
    userId: () => userId,
    now: time.now,
  });
  return { userId, live, follower };
}

/** One donor lot for the first catalog item, pickup at the given minute. */
function donorDraft(pickupByMinute: number): LiveLotDraft {
  const entry = CATALOG[0];
  return {
    donorId: 'D01',
    items: [lotItemFor({ foodItem: entry.foodItem, unit: entry.unit, quantity: entry.minQty }, entry)],
    pickupByMinute,
  };
}

function statusOf(p: Phone): FollowStatus {
  return p.follower.getStatus();
}

describe('two phones: the dashboard applies follower requests and both replay the same log', () => {
  test('a donor lot and a driver offer and commit replay identically on every phone', async () => {
    const { bus, time, live, dashboard, session } = setup();
    const donor = phone(bus, time, 'donor');
    const driver = phone(bus, time, 'driver');

    // Before the start: 17:00, stopped. The held driver is set now (decision D-Q5).
    expect(dashboard.setHeldDrivers(['V19']).ok).toBe(true);
    await settle();
    expect(bus.row(session.id).heldDrivers).toEqual(['V19']);

    donor.follower.join(CODE);
    driver.follower.join(CODE);
    await donor.follower.pass();
    await driver.follower.pass();
    await settle();
    expect(statusOf(donor).state).toBe('live');
    expect(statusOf(driver).state).toBe('live');
    expect(statusOf(driver).watchOnly).toBe(false); // joined before the start
    expect(driver.live.heldDrivers()).toEqual(['V19']);

    // The dashboard moves to 17:31 and pauses: the followers follow the shared clock.
    live.seek(1051);
    await dashboard.pass();
    await settle();
    expect(donor.live.getSnapshot().minute).toBe(1051);
    expect(driver.live.getSnapshot().minute).toBe(1051);

    // The donor posts a lot from its phone: it is a request, not a local input.
    const local = donor.live.postLot(donorDraft(1200));
    expect(local.ok).toBe(false);
    expect(donor.live.inputLog()).toHaveLength(0);
    donor.follower.send(lotRequest(donorDraft(1200)));
    await donor.follower.pass();
    await dashboard.pass();
    await settle();
    await donor.follower.pass();
    await settle();

    expect(bus.requestsOf(session.id).map((r) => r.status)).toEqual(['applied']);
    expect(live.postedLots().map((l) => l.id)).toEqual(expect.arrayContaining(['LIVE-1']));
    expect(statusOf(donor).requests).toEqual([]); // applied requests leave the list
    expect(digestOf(donor.live.visibleLog())).toBe(digestOf(live.visibleLog()));

    // The driver answers for its own driver id: an offer at 17:31, then a commit at 17:32.
    driver.follower.send(answerRequest('L0227', 'V19', 'offer'));
    await driver.follower.pass();
    await dashboard.pass();
    await settle();
    live.seek(1052);
    await dashboard.pass();
    await settle();
    driver.follower.send(answerRequest('L0227', 'V19', 'commit'));
    await driver.follower.pass();
    await dashboard.pass();
    await settle();
    await driver.follower.pass();
    await donor.follower.pass();
    await settle();

    const answers = bus.requestsOf(session.id).filter((r) => (r.input as { type: string }).type === 'DRIVER_RESPONSE');
    expect(answers.map((r) => r.status)).toEqual(['applied', 'applied']);

    // Every phone has the same visible log at the same minute, and the session rows are one contiguous seq run.
    for (const p of [donor, driver]) {
      expect(p.live.getSnapshot().minute).toBe(live.getSnapshot().minute);
      expect(digestOf(p.live.visibleLog())).toBe(digestOf(live.visibleLog()));
    }
    const seqs = bus.storedInputs(session.id).map((i) => i.seq);
    expect(seqs).toEqual(seqs.map((_, i) => i + 1));
    expect(bus.storedInputs(session.id).map((i) => i.input.type)).toEqual(['LOT_POSTED', 'DRIVER_RESPONSE', 'DRIVER_RESPONSE']);
  });

  test('a rejected request carries the reason to the phone that sent it', async () => {
    const { bus, time, live, dashboard, session } = setup();
    const donor = phone(bus, time, 'donor');
    donor.follower.join(CODE);
    await donor.follower.pass();
    live.seek(1080); // 18:00: a pickup at 17:50 is in the past
    await dashboard.pass();
    await settle();

    donor.follower.send(lotRequest(donorDraft(1070)));
    await donor.follower.pass();
    await dashboard.pass();
    await settle();
    await donor.follower.pass();
    await settle();

    const rejected = statusOf(donor).requests.filter((r) => r.status === 'rejected');
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toBe('pickup time must be later than the clock');
    expect(bus.requestsOf(session.id)[0].status).toBe('rejected');
    expect(bus.storedInputs(session.id)).toHaveLength(0);
    expect(live.postedLots().some((l) => l.origin === 'live')).toBe(false);
  });

  test('an unheld driver is refused by the database, and a driver cannot answer for another driver', async () => {
    const { bus, time, live, dashboard, session } = setup();
    const other = phone(bus, time, 'driver2');
    expect(dashboard.setHeldDrivers(['V19']).ok).toBe(true);
    other.follower.join(CODE);
    await other.follower.pass();
    await settle();
    // Its own profile V21 is not held: the database refuses the request, so it never reaches the dashboard.
    live.seek(1031);
    await dashboard.pass();
    await settle();
    other.follower.send(answerRequest('L0227', 'V21', 'offer'));
    await other.follower.pass();
    await dashboard.pass();
    await settle();
    await other.follower.pass();
    await settle();
    expect(bus.requestsOf(session.id)).toHaveLength(0);
    expect(statusOf(other).requests.filter((r) => r.status === 'rejected')[0].reason).toBe(
      'input_requests: this role may not send that input',
    );
    // Its request for another driver's id is refused by the database too.
    expect(() => bus.insertRequest('driver2', session.id, answerRequest('L0227', 'V19', 'offer'))).toThrow(
      'input_requests: this role may not send that input',
    );
  });

  test('a follower never uses its own inputs: local controls do nothing and its log is the session log', async () => {
    const { bus, time, live, session } = setup();
    const donor = phone(bus, time, 'donor');
    donor.follower.join(CODE);
    await donor.follower.pass();
    await settle();
    expect(donor.live.isFollower()).toBe(true);
    donor.live.start(time.now());
    expect(donor.live.getSnapshot().running).toBe(false);
    donor.live.seek(1100);
    expect(donor.live.getSnapshot().minute).toBe(1020);
    expect(donor.live.nextLiveIds(2)).toEqual([]);
    const local = donor.live.postLot(donorDraft(1200));
    expect(local.ok).toBe(false);
    expect(donor.live.inputLog()).toEqual([]);
    expect(bus.storedInputs(session.id)).toEqual([]);
    expect(live.inputLog()).toEqual([]);
  });

  test('offline: the follower keeps and freezes its last state, then re-reads and replays on reconnect', async () => {
    const { bus, time, live, dashboard } = setup();
    const donor = phone(bus, time, 'donor');
    donor.follower.join(CODE);
    await donor.follower.pass();
    live.seek(1040);
    await dashboard.pass();
    await settle();
    expect(donor.live.getSnapshot().minute).toBe(1040);

    bus.setOnline(false);
    await settle();
    await donor.follower.pass();
    expect(statusOf(donor).state).toBe('offline');
    expect(statusOf(donor).message).toBe('Not connected.');
    const frozenAt = donor.live.getSnapshot().minute;

    // The dashboard keeps going while the donor phone is offline.
    live.seek(1060);
    await dashboard.pass();
    await donor.follower.pass();
    expect(donor.live.getSnapshot().minute).toBe(frozenAt);

    bus.setOnline(true);
    await settle();
    await donor.follower.pass();
    await dashboard.pass();
    await settle();
    expect(statusOf(donor).state).toBe('live');
    expect(donor.live.getSnapshot().minute).toBe(1060);
    expect(digestOf(donor.live.visibleLog())).toBe(digestOf(live.visibleLog()));
  });

  test('a request made offline is kept, sent on reconnect, and applied once', async () => {
    const { bus, time, live, dashboard, session } = setup();
    const donor = phone(bus, time, 'donor');
    donor.follower.join(CODE);
    await donor.follower.pass();
    live.seek(1040);
    await dashboard.pass();
    await settle();

    bus.setOnline(false);
    await settle();
    donor.follower.send(lotRequest(donorDraft(1200)));
    await settle();
    expect(statusOf(donor).requests.map((r) => r.status)).toEqual(['unsent']);

    bus.setOnline(true);
    await settle();
    await donor.follower.pass();
    await dashboard.pass();
    await dashboard.pass();
    await settle();
    await donor.follower.pass();
    await settle();
    expect(bus.requestsOf(session.id).map((r) => r.status)).toEqual(['applied']);
    expect(bus.storedInputs(session.id)).toHaveLength(1);
    expect(live.postedLots().filter((l) => l.origin === 'live')).toHaveLength(1);
  });

  test('a join with a code that is not a session is refused; a session that ended asks for a new code', async () => {
    const { bus, time, dashboard, session } = setup();
    const donor = phone(bus, time, 'donor');
    donor.follower.join('ZZZZZZ');
    await donor.follower.pass();
    await settle();
    expect(statusOf(donor).state).toBe('refused');
    expect(statusOf(donor).message).toBe('No session has that code.');

    donor.follower.join(CODE);
    await donor.follower.pass();
    await settle();
    expect(statusOf(donor).state).toBe('live');
    bus.endSession(session.id, new Date(time.now()).toISOString());
    await settle();
    expect(statusOf(donor).state).toBe('ended');
    expect(statusOf(donor).message).toBe('This session ended. Join again with the new code.');
    expect(dashboard.getStatus().sessionId).toBe(session.id);
  });

  test('the dashboard never applies a request twice, even when it is read twice', async () => {
    const { bus, time, live, dashboard, session } = setup();
    const donor = phone(bus, time, 'donor');
    donor.follower.join(CODE);
    await donor.follower.pass();
    live.seek(1040);
    await dashboard.pass();
    await settle();
    donor.follower.send(lotRequest(donorDraft(1200)));
    await settle();
    await Promise.all([dashboard.applyPending(), dashboard.applyPending()]);
    await dashboard.applyPending();
    await settle();
    expect(bus.accepted.filter((a) => a.startsWith('request:') && a.endsWith(':applied'))).toHaveLength(1);
    expect(bus.storedInputs(session.id)).toHaveLength(1);
  });
});
