/**
 * A role change through the runtime (pickRole), on the fake Supabase client: the outgoing user's queued writes are sent
 * before the sign-out, writes that cannot be sent stay queued under their user, and they are sent once that role is
 * chosen again.
 */
import type { Fake, KvStore } from './fakeSupabase';

jest.mock('@supabase/supabase-js', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeFakeSupabase } = require('./fakeSupabase') as typeof import('./fakeSupabase');
  const fake = makeFakeSupabase();
  return {
    createClient: () => fake.client,
    isAuthRetryableFetchError: (error: unknown) => fake.isRetryable(error),
    __fake: fake,
  };
});

jest.mock('expo-sqlite/kv-store', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeKvStore } = require('./fakeSupabase') as typeof import('./fakeSupabase');
  return { __esModule: true, default: makeKvStore() };
});

jest.mock('../../config/server', () => ({
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
  PARSE_BASE_URL: 'https://test.supabase.co/functions/v1',
  PARSE_TIMEOUT_MS: 8000,
}));

function load() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fake = (require('@supabase/supabase-js') as unknown as { __fake: Fake }).__fake;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const kv = (require('expo-sqlite/kv-store') as unknown as { default: KvStore }).default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const runtime = require('../runtime') as typeof import('../runtime');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const supabase = require('../supabase') as typeof import('../supabase');
  return { fake, kv, runtime, supabase };
}

const eventRow = (seq: number) => ({ session_id: 'session-1', seq, event: { type: 'MESSAGE' } });

describe('role change through the runtime', () => {
  it('the wait before a sign-out is 5 seconds', () => {
    const { runtime } = load();
    expect(runtime.FLUSH_BEFORE_SIGN_OUT_MS).toBe(5000);
  });

  it('sends the outgoing user queued writes before signing out', async () => {
    const { fake, runtime, supabase } = load();
    await runtime.pickRole('donor', 'D01');
    expect(fake.signedInUser()).toBe('user-1');
    runtime.outbox.enqueue({ userId: 'user-1', table: 'events', kind: 'upsert', onConflict: 'session_id,seq', rows: [eventRow(1)] });

    await runtime.pickRole('dashboard', null);

    expect(fake.writes.some((w) => w.table === 'events')).toBe(true);
    expect(runtime.outbox.queuedFor('user-1')).toBe(0);
    expect(runtime.outbox.strandedCount(supabase.currentUserId())).toBe(0);
  });

  it('waits for the outgoing user queue with the 5 s limit', async () => {
    const { runtime } = load();
    await runtime.pickRole('donor', 'D01');
    const wait = jest.spyOn(runtime.outbox, 'flushWithin');
    await runtime.pickRole('dashboard', null);
    expect(wait).toHaveBeenCalledWith('user-1', 5000);
    wait.mockRestore();
  });

  it('writes that cannot be sent stay queued under their user, and are sent when that role is chosen again', async () => {
    const { fake, runtime, supabase } = load();
    await runtime.pickRole('donor', 'D01');
    runtime.outbox.enqueue({ userId: 'user-1', table: 'events', kind: 'upsert', onConflict: 'session_id,seq', rows: [eventRow(2)] });

    fake.net.down = true;
    await runtime.pickRole('dashboard', null);
    expect(fake.signedInUser()).toBeNull();
    expect(runtime.outbox.queuedFor('user-1')).toBe(1);
    expect(runtime.outbox.strandedCount(supabase.currentUserId())).toBe(1);

    fake.net.down = false;
    await runtime.pickRole('donor', 'D01');
    expect(fake.signedInUser()).toBe('user-1');
    expect(runtime.outbox.strandedCount(supabase.currentUserId())).toBe(0);
    await runtime.outbox.flush(supabase.currentUserId());
    expect(fake.writes.filter((w) => w.table === 'events')).toHaveLength(1);
    expect(runtime.outbox.queuedFor('user-1')).toBe(0);
  });

  it('an explicit discard removes the stranded writes and forgets their kept session', async () => {
    const { fake, kv, runtime, supabase } = load();
    await runtime.pickRole('donor', 'D01');
    runtime.outbox.enqueue({ userId: 'user-1', table: 'events', kind: 'upsert', onConflict: 'session_id,seq', rows: [eventRow(3)] });
    fake.net.down = true;
    await runtime.pickRole('dashboard', null);
    fake.net.down = false;
    expect(runtime.outbox.strandedCount(supabase.currentUserId())).toBe(1);

    const gone = runtime.outbox.discardStranded(supabase.currentUserId());
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const session = require('../session') as typeof import('../session');
    await session.forgetKeptSessions(gone.userIds);

    expect(gone).toEqual({ count: 1, userIds: ['user-1'] });
    expect(runtime.outbox.strandedCount(supabase.currentUserId())).toBe(0);
    expect(JSON.parse((await kv.getItem('salo.backend.kept.v1')) ?? '{}')).toEqual({});
    expect(fake.writes.some((w) => w.table === 'events')).toBe(false);
  });
});
