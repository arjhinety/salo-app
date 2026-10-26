import { databaseStatusLine, Outbox, outcomeOf, OUTBOX_KEY, type OutboxItem, type WriteOutcome } from '../outbox';
import { makeKvStore } from './fakeSupabase';

const flushTick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A sender that records each group and answers with the outcome given for that call (default: ok). */
function recordingSender(answers: WriteOutcome[] = []) {
  const groups: string[][] = [];
  const rowCounts: number[] = [];
  let call = 0;
  const send = jest.fn(async (group: OutboxItem[]): Promise<WriteOutcome> => {
    groups.push(group.map((i) => i.table));
    rowCounts.push(group.reduce((n, i) => n + (i.rows?.length ?? 1), 0));
    const answer = answers[call] ?? { kind: 'ok' as const };
    call += 1;
    return answer;
  });
  return { send, groups, rowCounts };
}

const upsert = (userId: string, table: string, rows: number, onConflict = 'id') => ({
  userId,
  table,
  kind: 'upsert' as const,
  onConflict,
  rows: Array.from({ length: rows }, (_, i) => ({ n: i })),
});

describe('Outbox: order and delivery', () => {
  it('sends the queue in order and removes what was delivered', async () => {
    const { send, groups } = recordingSender();
    const box = new Outbox(makeKvStore(), send);
    box.enqueue(upsert('U1', 'live_sessions', 1));
    box.enqueue({ userId: 'U1', table: 'live_sessions', kind: 'update', values: { ended_at: 'x' }, match: { id: 's' } });
    box.enqueue(upsert('U1', 'events', 1, 'session_id,seq'));

    const report = await box.flush('U1');

    expect(groups).toEqual([['live_sessions'], ['live_sessions'], ['events']]);
    expect(report).toEqual({ delivered: 3, rejected: 0, stopped: false });
    expect(box.pending()).toHaveLength(0);
    expect(box.getStatus()).toEqual({ online: true, queued: 0, rejected: 0 });
  });

  it('sends only the items of the user who is signed in; the others wait', async () => {
    const { send, groups } = recordingSender();
    const box = new Outbox(makeKvStore(), send);
    box.enqueue(upsert('A', 'events', 1, 'session_id,seq'));
    box.enqueue(upsert('B', 'lots', 1, 'session_id,lot_id'));
    box.enqueue(upsert('A', 'events', 2, 'session_id,seq'));

    await box.flush('B');
    expect(groups).toEqual([['lots']]);
    expect(box.pending().map((i) => i.userId)).toEqual(['A', 'A']);

    await box.flush('A');
    expect(groups).toEqual([['lots'], ['events', 'events']]);
    expect(box.pending()).toHaveLength(0);
  });

  it('batches consecutive upserts to the same table and key into one request, and not across another item', () => {
    const box = new Outbox(makeKvStore(), recordingSender().send);
    const e1 = box.enqueue(upsert('U1', 'events', 2, 'session_id,seq'));
    const e2 = box.enqueue(upsert('U1', 'events', 3, 'session_id,seq'));
    box.enqueue(upsert('U1', 'lots', 1, 'session_id,lot_id'));
    box.enqueue(upsert('U1', 'events', 1, 'session_id,seq'));

    expect(box.nextGroup('U1')?.map((i) => i.id)).toEqual([e1.id, e2.id]);
  });

  it('a batch goes out as one request with all of its rows', async () => {
    const { send, rowCounts } = recordingSender();
    const box = new Outbox(makeKvStore(), send);
    box.enqueue(upsert('U1', 'events', 2, 'session_id,seq'));
    box.enqueue(upsert('U1', 'events', 3, 'session_id,seq'));
    await box.flush('U1');
    expect(send).toHaveBeenCalledTimes(1);
    expect(rowCounts).toEqual([5]);
  });

  it('a retryable failure stops the flush, keeps the order, and marks the phone offline', async () => {
    const { send, groups } = recordingSender([{ kind: 'retry', reason: 'Network request failed' }]);
    const box = new Outbox(makeKvStore(), send);
    box.enqueue(upsert('U1', 'live_sessions', 1));
    box.enqueue(upsert('U1', 'lots', 1, 'session_id,lot_id'));

    const report = await box.flush('U1');

    expect(report).toEqual({ delivered: 0, rejected: 0, stopped: true });
    expect(groups).toEqual([['live_sessions']]);
    expect(box.pending().map((i) => i.table)).toEqual(['live_sessions', 'lots']);
    expect(box.getStatus()).toEqual({ online: false, queued: 2, rejected: 0 });
  });

  it('a permanent refusal drops that group, counts it, and lets the rest go on', async () => {
    const { send, groups } = recordingSender([{ kind: 'rejected', reason: 'new row violates row-level security' }]);
    const box = new Outbox(makeKvStore(), send);
    box.enqueue(upsert('U1', 'lots', 1, 'session_id,lot_id'));
    box.enqueue(upsert('U1', 'events', 1, 'session_id,seq'));
    const seen: string[] = [];
    box.onRejected((item) => seen.push(item.table));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    const report = await box.flush('U1');

    expect(groups).toEqual([['lots'], ['events']]);
    expect(report).toEqual({ delivered: 1, rejected: 1, stopped: false });
    expect(seen).toEqual(['lots']);
    expect(box.getStatus().rejected).toBe(1);
    expect(box.pending()).toHaveLength(0);
    warn.mockRestore();
  });

  it('a second flush while one is running does nothing', async () => {
    let release: () => void = () => undefined;
    const send = jest.fn(
      () =>
        new Promise<WriteOutcome>((resolve) => {
          release = () => resolve({ kind: 'ok' });
        }),
    );
    const box = new Outbox(makeKvStore(), send);
    box.enqueue(upsert('U1', 'events', 1, 'session_id,seq'));
    const first = box.flush('U1');
    const second = await box.flush('U1');
    expect(second).toEqual({ delivered: 0, rejected: 0, stopped: false });
    release();
    await first;
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a signed-in user', async () => {
    const { send } = recordingSender();
    const box = new Outbox(makeKvStore(), send);
    box.enqueue(upsert('U1', 'events', 1, 'session_id,seq'));
    await box.flush(null);
    expect(send).not.toHaveBeenCalled();
    expect(box.pending()).toHaveLength(1);
  });

  it('the status object is the same until something changes', () => {
    const box = new Outbox(makeKvStore(), recordingSender().send);
    const a = box.getStatus();
    expect(box.getStatus()).toBe(a);
    box.enqueue(upsert('U1', 'events', 1, 'session_id,seq'));
    expect(box.getStatus()).not.toBe(a);
    expect(box.getStatus().queued).toBe(1);
  });
});

describe('Outbox: storage', () => {
  it('keeps the queue in storage and loads it back in order', async () => {
    const store = makeKvStore();
    const first = new Outbox(store, recordingSender().send);
    first.enqueue(upsert('U1', 'live_sessions', 1));
    first.enqueue(upsert('U1', 'lots', 1, 'session_id,lot_id'));
    await flushTick();

    const restarted = new Outbox(store, recordingSender().send);
    await restarted.load();

    expect(restarted.pending().map((i) => i.table)).toEqual(['live_sessions', 'lots']);
    expect(restarted.getStatus().queued).toBe(2);
    expect(JSON.parse(store.data.get(OUTBOX_KEY) ?? '[]')).toHaveLength(2);
  });

  it('starts empty when the stored queue is damaged', async () => {
    const store = makeKvStore();
    store.data.set(OUTBOX_KEY, '{not json');
    const box = new Outbox(store, recordingSender().send);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await box.load();
    expect(box.pending()).toHaveLength(0);
    warn.mockRestore();
  });
});

describe('outcomeOf and the status line', () => {
  it.each([
    [undefined, { error: null, status: 201 }, 'ok'],
    ['no response', { error: { message: 'fetch failed' }, status: 0 }, 'retry'],
    ['session expired', { error: { message: 'JWT expired' }, status: 401 }, 'retry'],
    ['rate limit', { error: { message: 'slow down' }, status: 429 }, 'retry'],
    ['server error', { error: { message: 'boom' }, status: 503 }, 'retry'],
    ['RLS refusal', { error: { message: 'new row violates row-level security policy' }, status: 403 }, 'rejected'],
    ['check constraint', { error: { message: 'check constraint' }, status: 400 }, 'rejected'],
  ])('%s -> %s', (_label, res, kind) => {
    expect(outcomeOf(res).kind).toBe(kind);
  });

  it('shows the database state in English', () => {
    expect(databaseStatusLine({ online: true, queued: 0, rejected: 0 })).toBe('Database: connected');
    expect(databaseStatusLine({ online: true, queued: 3, rejected: 0 })).toBe('Database: connected, queued 3');
    expect(databaseStatusLine({ online: false, queued: 2, rejected: 0 })).toBe('Database: offline, queued 2');
    expect(databaseStatusLine({ online: null, queued: 0, rejected: 0 })).toBe('Database: connecting');
  });
});

describe('Outbox: waiting before a role change, and writes of another user', () => {
  it('flushWithin sends the signed-in user queue and reports done', async () => {
    const { send, groups } = recordingSender();
    const box = new Outbox(makeKvStore(), send);
    box.enqueue(upsert('U1', 'events', 1, 'session_id,seq'));
    expect(await box.flushWithin('U1', 5000)).toBe('done');
    expect(groups).toEqual([['events']]);
    expect(box.queuedFor('U1')).toBe(0);
  });

  it('flushWithin gives up after the time given and keeps the items that were not sent', async () => {
    jest.useFakeTimers();
    try {
      const send = jest.fn(() => new Promise<WriteOutcome>(() => undefined));
      const box = new Outbox(makeKvStore(), send);
      box.enqueue(upsert('U1', 'events', 1, 'session_id,seq'));
      const waiting = box.flushWithin('U1', 5000);
      jest.advanceTimersByTime(4999);
      await Promise.resolve();
      jest.advanceTimersByTime(1);
      expect(await waiting).toBe('timeout');
      expect(box.queuedFor('U1')).toBe(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('flushWithin waits for a pass already in progress before it sends', async () => {
    let release: () => void = () => undefined;
    const send = jest.fn(
      () =>
        new Promise<WriteOutcome>((resolve) => {
          release = () => resolve({ kind: 'ok' });
        }),
    );
    const box = new Outbox(makeKvStore(), send);
    box.enqueue(upsert('U1', 'events', 1, 'session_id,seq'));
    const pass = box.flush('U1');
    const waiting = box.flushWithin('U1', 5000);
    release();
    await pass;
    expect(await waiting).toBe('done');
    expect(send).toHaveBeenCalledTimes(1);
    expect(box.queuedFor('U1')).toBe(0);
  });

  it('counts the items of other users as stranded; the signed-in user items are not', () => {
    const { send } = recordingSender();
    const box = new Outbox(makeKvStore(), send);
    box.enqueue(upsert('U1', 'events', 1, 'session_id,seq'));
    box.enqueue(upsert('U1', 'events', 2, 'session_id,seq'));
    box.enqueue(upsert('U2', 'lots', 1, 'session_id,lot_id'));
    expect(box.queuedFor('U1')).toBe(2);
    expect(box.strandedCount('U2')).toBe(2);
    expect(box.strandedCount('U1')).toBe(1);
    expect(box.strandedCount(null)).toBe(3);
  });

  it('discardStranded removes only the other users items, when asked, and reports which users they were', () => {
    const { send } = recordingSender();
    const box = new Outbox(makeKvStore(), send);
    box.enqueue(upsert('U1', 'events', 1, 'session_id,seq'));
    box.enqueue(upsert('U2', 'lots', 1, 'session_id,lot_id'));
    box.enqueue(upsert('U3', 'events', 1, 'session_id,seq'));

    expect(box.strandedCount('U1')).toBe(2);
    const gone = box.discardStranded('U1');
    expect(gone).toEqual({ count: 2, userIds: ['U2', 'U3'] });
    expect(box.pending().map((i) => i.userId)).toEqual(['U1']);
    expect(box.discardStranded('U1')).toEqual({ count: 0, userIds: [] });
  });
});
