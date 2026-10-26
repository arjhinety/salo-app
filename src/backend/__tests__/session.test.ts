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

/** A fresh module registry, so the role state and the fake client start empty in every test. */
function load() {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fake = (require('@supabase/supabase-js') as unknown as { __fake: Fake }).__fake;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const kv = (require('expo-sqlite/kv-store') as unknown as { default: KvStore }).default;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const session = require('../session') as typeof import('../session');
  return { fake, kv, session };
}

describe('session: choosing a role and registering the device', () => {
  it('the first pick signs in anonymously and registers the device for the role; a second connect writes nothing', async () => {
    const { fake, session } = load();
    const release = jest.fn();

    await session.chooseRole('donor', 'D01', release);
    expect(release).not.toHaveBeenCalled();
    expect(await session.connect()).toBe('ok');

    expect(fake.signedInUser()).toBe('user-1');
    expect(fake.writes).toEqual([
      { table: 'devices', kind: 'upsert', rows: [{ id: 'user-1', role: 'donor', profile_id: 'D01' }], onConflict: 'id' },
    ]);
    expect(session.isRegistered()).toBe(true);
    expect(await session.connect()).toBe('ok');
    expect(fake.writes).toHaveLength(1);
  });

  it('a role change releases the run while the old user is still signed in, signs out, and registers a new user', async () => {
    const { fake, session } = load();
    const seenSignedIn: (string | null)[] = [];
    const release = jest.fn(() => seenSignedIn.push(fake.signedInUser()));

    await session.chooseRole('donor', 'D01', release);
    await session.connect();
    await session.chooseRole('dashboard', null, release);

    expect(release).toHaveBeenCalledWith('user-1');
    expect(seenSignedIn).toEqual(['user-1']);
    expect(fake.signedInUser()).toBeNull();
    expect(session.isRegistered()).toBe(false);

    expect(await session.connect()).toBe('ok');
    expect(fake.signedInUser()).toBe('user-2');
    expect(fake.writes.at(-1)).toEqual({
      table: 'devices',
      kind: 'upsert',
      rows: [{ id: 'user-2', role: 'dashboard', profile_id: null }],
      onConflict: 'id',
    });
  });

  it('choosing the same role again changes nothing', async () => {
    const { fake, session } = load();
    const release = jest.fn();
    await session.chooseRole('dashboard', null, release);
    await session.connect();
    await session.chooseRole('dashboard', null, release);
    expect(release).not.toHaveBeenCalled();
    expect(fake.signedInUser()).toBe('user-1');
  });

  it('offline: choosing a role does not need the network; registration waits and happens once the network is back', async () => {
    const { fake, session } = load();
    fake.net.down = true;

    await session.chooseRole('donor', 'D01', jest.fn());
    expect(await session.connect()).toBe('offline');
    expect(fake.writes).toHaveLength(0);
    expect(session.isRegistered()).toBe(false);

    fake.net.down = false;
    expect(await session.connect()).toBe('ok');
    expect(fake.writes).toHaveLength(1);
    expect(fake.writes[0].rows).toEqual([{ id: 'user-1', role: 'donor', profile_id: 'D01' }]);
  });

  it('a registration the server refuses is "rejected", is not marked as done, and is logged', async () => {
    const { fake, session } = load();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    fake.refuse = () => ({ status: 400, message: 'devices: unknown donor D99' });

    await session.chooseRole('donor', 'D99', jest.fn());
    expect(await session.connect()).toBe('rejected');
    expect(session.isRegistered()).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown donor'));
    warn.mockRestore();
  });

  it('the role state is stored and read back', async () => {
    const { kv, session } = load();
    await session.chooseRole('donor', 'D01', jest.fn());
    await session.connect();
    const stored = JSON.parse((await kv.getItem(session.ROLE_STATE_KEY)) ?? '{}') as Record<string, unknown>;
    expect(stored).toEqual({ role: 'donor', profileId: 'D01', registeredUserId: 'user-1' });

    // A restart: the same storage, a fresh module.
    const raw = await kv.getItem(session.ROLE_STATE_KEY);
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const restartedKv = (require('expo-sqlite/kv-store') as unknown as { default: KvStore }).default;
    await restartedKv.setItem(session.ROLE_STATE_KEY, raw ?? '');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fresh = require('../session') as typeof import('../session');
    await fresh.loadRoleState();
    expect(fresh.roleState()).toEqual({ role: 'donor', profileId: 'D01', registeredUserId: 'user-1' });
  });

  it('connect with no role chosen does nothing', async () => {
    const { fake, session } = load();
    expect(await session.connect()).toBe('idle');
    expect(fake.writes).toHaveLength(0);
  });
});

describe('session: queued writes keep their user until that role is chosen again', () => {
  it('a role left with writes still queued keeps that user; choosing the role again puts the session back, with no new device row', async () => {
    const { fake, kv, session } = load();
    await session.chooseRole('donor', 'D01', () => undefined);
    await session.connect();
    expect(fake.signedInUser()).toBe('user-1');

    await session.chooseRole('dashboard', null, () => true);
    expect(fake.signedInUser()).toBeNull();
    const kept = JSON.parse((await kv.getItem(session.KEPT_SESSIONS_KEY)) ?? '{}') as Record<string, unknown>;
    expect(Object.keys(kept)).toEqual(['user-1']);
    expect(kept['user-1']).toMatchObject({ userId: 'user-1', roleKey: 'donor:D01', registered: true });

    await session.chooseRole('donor', 'D01', () => false);
    expect(fake.signedInUser()).toBe('user-1');
    expect(session.isRegistered()).toBe(true);
    expect(await session.connect()).toBe('ok');
    expect(fake.writes).toHaveLength(1);
    expect(JSON.parse((await kv.getItem(session.KEPT_SESSIONS_KEY)) ?? '{}')).toEqual({});
  });

  it('a role left with nothing queued is not kept, so the next sign-in is a new user', async () => {
    const { fake, kv, session } = load();
    await session.chooseRole('donor', 'D01', () => undefined);
    await session.connect();
    await session.chooseRole('dashboard', null, () => false);
    expect(JSON.parse((await kv.getItem(session.KEPT_SESSIONS_KEY)) ?? '{}')).toEqual({});
    await session.chooseRole('donor', 'D01', () => false);
    expect(await session.connect()).toBe('ok');
    expect(fake.signedInUser()).toBe('user-2');
  });

  it('offline: a kept session that cannot be put back stays kept, and is tried again when its role is chosen again', async () => {
    const { fake, kv, session } = load();
    await session.chooseRole('donor', 'D01', () => undefined);
    await session.connect();
    await session.chooseRole('dashboard', null, () => true);

    fake.net.down = true;
    await session.chooseRole('donor', 'D01', () => false);
    expect(fake.signedInUser()).toBeNull();
    expect(JSON.parse((await kv.getItem(session.KEPT_SESSIONS_KEY)) ?? '{}')).toHaveProperty('user-1');

    fake.net.down = false;
    await session.chooseRole('donor', 'D01', () => false);
    expect(fake.signedInUser()).toBe('user-1');
    expect(JSON.parse((await kv.getItem(session.KEPT_SESSIONS_KEY)) ?? '{}')).toEqual({});
  });

  it('discarding a user forgets its kept session', async () => {
    const { kv, session } = load();
    await session.chooseRole('donor', 'D01', () => undefined);
    await session.connect();
    await session.chooseRole('dashboard', null, () => true);
    await session.forgetKeptSessions(['user-1']);
    expect(JSON.parse((await kv.getItem(session.KEPT_SESSIONS_KEY)) ?? '{}')).toEqual({});
  });
});
