import type { LogEntry } from '../../engine/types';
import { LiveEvening, type TimedInput } from '../../live/evening';
import { EveningSync, prefixIntact, selectUnsent, unsentLots, type Identity, type LiveLike } from '../eveningSync';
import type { OutboxItem } from '../outbox';
import type { Role } from '../types';

/** A live evening the test drives directly: the clock, the policy, the engine log and the inputs. */
class FakeLive {
  minute = 1020;
  policy = 'salo';
  log: LogEntry[] = [];
  inputs: TimedInput[] = [];
  private listeners = new Set<() => void>();

  getSnapshot = () => ({ minute: this.minute, policy: this.policy, eveningId: 'E05' }) as unknown as ReturnType<LiveLike['getSnapshot']>;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  visibleLog = () => this.log.filter((e) => e.atMinute <= this.minute);
  inputLog = () => this.inputs;

  /** Changes the state, then tells the subscribers, as LiveEvening.publish does. */
  change(fn: () => void): void {
    fn();
    for (const l of this.listeners) l();
  }
}

class FakeOutbox {
  items: OutboxItem[] = [];
  private delivered = new Set<(i: OutboxItem) => void>();
  private rejected = new Set<(i: OutboxItem) => void>();
  private n = 0;

  enqueue(item: Omit<OutboxItem, 'id'>): OutboxItem {
    this.n += 1;
    const full = { ...item, id: `i${this.n}` };
    this.items.push(full);
    return full;
  }
  onDelivered(fn: (i: OutboxItem) => void) {
    this.delivered.add(fn);
    return () => this.delivered.delete(fn);
  }
  onRejected(fn: (i: OutboxItem) => void) {
    this.rejected.add(fn);
    return () => this.rejected.delete(fn);
  }
  /** Simulates the outbox delivering an item to the server. */
  deliver(item: OutboxItem): void {
    for (const fn of this.delivered) fn(item);
  }
  refuse(item: OutboxItem): void {
    for (const fn of this.rejected) fn(item);
  }
  /** Delivers every queued item, in order, as a flush would. */
  deliverAll(): void {
    for (const item of [...this.items]) this.deliver(item);
  }
}

const entry = (seq: number, atMinute: number, lotId = 'LIVE-1'): LogEntry =>
  ({ seq, evening: 'E05', policy: 'salo', atMinute, event: { type: 'AWARD_STATE', lotId, state: 'offered' } }) as unknown as LogEntry;

const lotInput = (lotId: string, minute: number): TimedInput =>
  ({
    atMinute: minute,
    input: {
      type: 'LOT_POSTED',
      lot: { id: lotId, donorId: 'D01', items: [{ foodItem: 'pandesal' }], estKg: 1.2, loadUnits: 1, postedMinute: minute, pickupByMinute: minute + 60, origin: 'live' },
    },
  }) as unknown as TimedInput;

function setup(initial: { uid: string | null; role: Role | null; registered: boolean }) {
  const live = new FakeLive();
  const box = new FakeOutbox();
  const id = { ...initial };
  const who: Identity = {
    userId: () => id.uid,
    role: () => id.role,
    registered: () => id.registered,
  };
  let n = 0;
  const sync = new EveningSync(
    live as unknown as LiveLike,
    box,
    who,
    () => `session-${++n}`,
    () => '2026-10-26T12:00:00.000Z',
  );
  return { live, box, id, sync };
}

const rows = (item: OutboxItem): Record<string, unknown>[] => item.rows ?? [];
const seqsOf = (item: OutboxItem) => rows(item).map((r) => r.seq);

describe('pure helpers', () => {
  const log = [entry(1, 1020), entry(2, 1021), entry(3, 1025), entry(4, 1030), entry(5, 1030)];

  it('selectUnsent gives exactly the not-yet-sent entries strictly before the clock, in seq order', () => {
    expect(selectUnsent(log, 1030, 1).map((e) => e.seq)).toEqual([2, 3]);
    expect(selectUnsent(log, 1030, 3).map((e) => e.seq)).toEqual([]);
    expect(selectUnsent(log, 1031, 3).map((e) => e.seq)).toEqual([4, 5]);
    expect(selectUnsent(log, 1020, 0)).toEqual([]);
  });

  it('selectUnsent stops at the first entry at or after the clock, even if a later seq is earlier in time', () => {
    const odd = [entry(1, 1020), entry(2, 1040), entry(3, 1021)];
    expect(selectUnsent(odd, 1030, 0).map((e) => e.seq)).toEqual([1]);
  });

  it('prefixIntact is false when an uploaded entry changed or disappeared', () => {
    const sent = new Map([[1, JSON.stringify(log[0])], [2, JSON.stringify(log[1])]]);
    expect(prefixIntact(sent, log)).toBe(true);
    const changed = [log[0], { ...log[1], atMinute: 1022 }, ...log.slice(2)];
    expect(prefixIntact(sent, changed)).toBe(false);
    expect(prefixIntact(sent, [log[0]])).toBe(false);
    expect(prefixIntact(new Map(), [])).toBe(true);
  });

  it('unsentLots takes the LOT_POSTED inputs not yet uploaded, in input order', () => {
    const inputs = [lotInput('LIVE-1', 1020), lotInput('LIVE-2', 1021), { atMinute: 1022, input: { type: 'CANCEL_DRIVER', lotId: 'LIVE-1' } } as unknown as TimedInput];
    expect(unsentLots(inputs, new Set(['LIVE-1'])).map((l) => l.id)).toEqual(['LIVE-2']);
  });
});

describe('EveningSync: runs and uploads', () => {
  it('the dashboard user opens a run, and events wait until the run row is delivered', () => {
    const { live, box, sync } = setup({ uid: 'U1', role: 'dashboard', registered: true });
    live.log = [entry(1, 1020)];
    sync.start();

    expect(box.items.map((i) => i.table)).toEqual(['live_sessions']);
    const session = box.items[0];
    expect(session.userId).toBe('U1');
    expect(rows(session)[0]).toMatchObject({ id: 'session-1', evening_id: 'E05', policy: 'salo', created_by: 'U1' });
    expect(sync.activeSessionId()).toBe('session-1');

    live.change(() => (live.minute = 1030));
    expect(box.items).toHaveLength(1);

    box.deliver(session);
    expect(box.items.map((i) => i.table)).toEqual(['live_sessions', 'events']);
    expect(seqsOf(box.items[1])).toEqual([1]);
  });

  it('uploads exactly the entries before the clock, in seq order, and never twice', () => {
    const { live, box, sync } = setup({ uid: 'U1', role: 'dashboard', registered: true });
    live.log = [entry(1, 1020), entry(2, 1021), entry(3, 1025), entry(4, 1030), entry(5, 1030)];
    sync.start();
    box.deliverAll();

    live.change(() => (live.minute = 1030));
    const eventItems = () => box.items.filter((i) => i.table === 'events');
    expect(eventItems().map(seqsOf)).toEqual([[1, 2, 3]]);
    expect(rows(eventItems()[0]).every((r) => (r.at_minute as number) < 1030)).toBe(true);

    live.change(() => (live.minute = 1030));
    expect(eventItems()).toHaveLength(1);

    live.change(() => (live.minute = 1031));
    expect(eventItems().map(seqsOf)).toEqual([[1, 2, 3], [4, 5]]);
  });

  it('a rewind (seek back) ends the run and opens a new one, whose events start again at seq 1', () => {
    const { live, box, sync } = setup({ uid: 'U1', role: 'dashboard', registered: true });
    live.log = [entry(1, 1020), entry(2, 1021)];
    sync.start();
    box.deliverAll();
    live.change(() => (live.minute = 1025));
    box.deliverAll();

    live.change(() => (live.minute = 1020));

    const endItem = box.items.find((i) => i.kind === 'update');
    expect(endItem).toMatchObject({ table: 'live_sessions', match: { id: 'session-1' }, values: { ended_at: '2026-10-26T12:00:00.000Z' } });
    const newSession = box.items.find((i) => i.table === 'live_sessions' && i.kind === 'upsert' && rows(i)[0].id === 'session-2');
    expect(newSession).toBeDefined();
    expect(sync.activeSessionId()).toBe('session-2');

    box.deliverAll();
    live.change(() => (live.minute = 1025));
    const runTwoEvents = box.items.filter((i) => i.table === 'events' && rows(i)[0]?.session_id === 'session-2');
    expect(runTwoEvents.map(seqsOf)).toEqual([[1, 2]]);
  });

  it('a change to an entry already uploaded (a cancel that rewrote the past) ends the run', () => {
    const { live, box, sync } = setup({ uid: 'U1', role: 'dashboard', registered: true });
    live.log = [entry(1, 1020), entry(2, 1021)];
    sync.start();
    box.deliverAll();
    live.change(() => (live.minute = 1025));
    box.deliverAll();

    live.change(() => (live.log = [entry(1, 1020), { ...entry(2, 1021), atMinute: 1022 }]));

    expect(box.items.some((i) => i.kind === 'update' && i.match?.id === 'session-1')).toBe(true);
    expect(sync.activeSessionId()).toBe('session-2');
  });

  it('a policy change ends the run', () => {
    const { live, box, sync } = setup({ uid: 'U1', role: 'dashboard', registered: true });
    sync.start();
    box.deliverAll();
    live.change(() => (live.policy = 'fcfs'));
    expect(sync.activeSessionId()).toBe('session-2');
    expect(rows(box.items[box.items.length - 1])[0]).toMatchObject({ id: 'session-2', policy: 'fcfs' });
  });

  it('beginRun (Replay with baseline) ends the run; the next change opens a new one', () => {
    const { live, box, sync } = setup({ uid: 'U1', role: 'dashboard', registered: true });
    sync.start();
    box.deliverAll();
    sync.beginRun();
    expect(sync.activeSessionId()).toBeNull();
    live.change(() => (live.minute = 1020));
    expect(sync.activeSessionId()).toBe('session-2');
  });

  it('release ends the run while its user is still signed in, after the remaining events are queued', () => {
    const { live, box, sync } = setup({ uid: 'U1', role: 'dashboard', registered: true });
    live.log = [entry(1, 1020)];
    sync.start();
    box.deliverAll();
    live.log = [entry(1, 1020), entry(2, 1020)];
    live.minute = 1021;
    sync.release('U1');
    const tail = box.items.slice(-2);
    expect(tail.map((i) => i.table + ':' + i.kind)).toEqual(['events:upsert', 'live_sessions:update']);
    expect(tail[0].userId).toBe('U1');
    expect(sync.activeSessionId()).toBeNull();
  });

  it('a run row the server refuses stops uploads for that run until beginRun', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { live, box, sync } = setup({ uid: 'U1', role: 'dashboard', registered: true });
    live.log = [entry(1, 1020)];
    sync.start();
    box.refuse(box.items[0]);
    live.change(() => (live.minute = 1030));
    expect(box.items.map((i) => i.table)).toEqual(['live_sessions']);
    expect(sync.activeSessionId()).toBeNull();
    sync.beginRun();
    live.change(() => (live.minute = 1031));
    expect(sync.activeSessionId()).toBe('session-2');
    warn.mockRestore();
  });

  it('nothing is opened or sent while the dashboard user is not registered', () => {
    const { live, box, sync } = setup({ uid: 'U1', role: 'dashboard', registered: false });
    live.log = [entry(1, 1020)];
    sync.start();
    live.change(() => (live.minute = 1030));
    expect(box.items).toHaveLength(0);
    expect(sync.activeSessionId()).toBeNull();
  });
});

describe('EveningSync: lots and identities', () => {
  it('lots posted before the run opened are backfilled into it, once; later posts go in as they happen', () => {
    const { live, box, sync } = setup({ uid: 'U1', role: 'dashboard', registered: true });
    live.inputs = [lotInput('LIVE-1', 1020)];
    sync.start();
    box.deliverAll();
    const lotItems = () => box.items.filter((i) => i.table === 'lots');
    expect(lotItems().map((i) => rows(i).map((r) => r.lot_id))).toEqual([['LIVE-1']]);
    expect(rows(lotItems()[0])[0]).toMatchObject({ session_id: 'session-1', donor_id: 'D01', created_by: 'U1', origin: 'live', est_kg: 1.2 });

    live.change(() => live.inputs.push(lotInput('LIVE-2', 1021)));
    expect(lotItems().map((i) => rows(i).map((r) => r.lot_id))).toEqual([['LIVE-1'], ['LIVE-2']]);
    live.change(() => (live.minute = 1022));
    expect(lotItems()).toHaveLength(2);
  });

  it('a donor phone posts into the dashboard run under its own user; events wait for the dashboard user', () => {
    const { live, box, id, sync } = setup({ uid: 'U1', role: 'dashboard', registered: true });
    live.log = [entry(1, 1020)];
    sync.start();
    box.deliverAll();

    id.uid = 'D1';
    id.role = 'donor';
    live.change(() => live.inputs.push(lotInput('LIVE-3', 1022)));
    live.change(() => (live.minute = 1030));

    const lot = box.items.find((i) => i.table === 'lots');
    expect(lot).toMatchObject({ userId: 'D1' });
    expect(rows(lot!)[0]).toMatchObject({ session_id: 'session-1', created_by: 'D1' });
    expect(box.items.filter((i) => i.table === 'events')).toHaveLength(0);
    expect(sync.activeSessionId()).toBe('session-1');
  });

  it('a donor phone never opens a run', () => {
    const { live, box, sync } = setup({ uid: 'D1', role: 'donor', registered: true });
    sync.start();
    live.change(() => (live.minute = 1030));
    expect(box.items).toHaveLength(0);
  });

  it('a different dashboard user opens its own run and the old one ends', () => {
    const { box, id, sync, live } = setup({ uid: 'U1', role: 'dashboard', registered: true });
    sync.start();
    box.deliverAll();
    id.uid = 'U2';
    live.change(() => (live.minute = 1021));
    expect(box.items.some((i) => i.kind === 'update' && i.match?.id === 'session-1')).toBe(true);
    expect(box.items.find((i) => i.table === 'live_sessions' && rows(i)[0]?.id === 'session-2')?.userId).toBe('U2');
  });
});

describe('EveningSync with the real live evening', () => {
  it('uploads only the engine entries before the clock, against a real run', () => {
    const live = new LiveEvening({ secondsPerMinute: 6 });
    const box = new FakeOutbox();
    const who: Identity = { userId: () => 'U1', role: () => 'dashboard', registered: () => true };
    const sync = new EveningSync(live, box, who, () => 'real-session', () => '2026-10-26T12:00:00.000Z');
    sync.start();
    box.deliverAll();

    live.seek(1030);
    const expected = live
      .visibleLog()
      .filter((e) => e.atMinute < 1030)
      .map((e) => e.seq);
    const uploaded = box.items.filter((i) => i.table === 'events').flatMap(seqsOf);

    expect(uploaded).toEqual(expected);
    expect(uploaded.length).toBeGreaterThan(0);
  });
});
