/**
 * The app side of the join attempt limit (migration 20261101100000): the database's "too many attempts" error becomes a
 * `limited` SessionError, a locked-out phone stops trying on the loop, and the join copy is the agreed wording.
 */
import { LiveEvening } from '../../live/evening';
import { SYNC } from '../../i18n/sync';
import { Follower } from '../follower';
import { makeSupabaseSessionApi, SessionError, toSessionError, type SessionApi } from '../sessionApi';
import type { SupabaseClient } from '@supabase/supabase-js';

describe('join attempt limit: error mapping', () => {
  test('join_session returning NULL (unknown code, recorded as a failed try) maps to not-found', async () => {
    const client = { rpc: () => Promise.resolve({ data: null, error: null }) };
    const api = makeSupabaseSessionApi(client as unknown as SupabaseClient, () => 'donor-user');
    const error = await api.join('NOPE00').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SessionError);
    expect((error as SessionError).kind).toBe('not-found');
  });

  test('join_session returning a session id is returned unchanged', async () => {
    const client = { rpc: () => Promise.resolve({ data: 'sess-1', error: null }) };
    const api = makeSupabaseSessionApi(client as unknown as SupabaseClient, () => 'donor-user');
    await expect(api.join('K7Q2MX')).resolves.toBe('sess-1');
  });

  test('the database message for too many attempts maps to kind limited', () => {
    const error = toSessionError(
      { code: '53400', message: 'join_session: too many attempts. Wait 10 minutes and try again.' },
      'join_session',
    );
    expect(error).toBeInstanceOf(SessionError);
    expect(error.kind).toBe('limited');
  });

  test('the other join refusals keep their kinds', () => {
    expect(toSessionError({ code: '42501', message: 'join_session: register the device first' }, 'join_session').kind).toBe(
      'refused',
    );
    expect(toSessionError({ code: 'P0002', message: 'join_session: no session has that code' }, 'join_session').kind).toBe(
      'not-found',
    );
  });
});

describe('join attempt limit: the follower', () => {
  test('a locked-out phone shows the limit, stops trying on the loop, and needs the code again', async () => {
    let calls = 0;
    const api = {
      join: async () => {
        calls++;
        throw new SessionError('limited', 'join_session: join_session: too many attempts. Wait 10 minutes and try again.');
      },
    } as unknown as SessionApi;
    const follower = new Follower({ api, live: new LiveEvening(), registered: () => true, userId: () => 'donor-user' });

    follower.join('K7Q2MX');
    await follower.pass();
    expect(calls).toBe(1);
    expect(follower.getStatus().state).toBe('refused');
    expect(follower.getStatus().message).toBe('Too many tries. Wait 10 minutes.');

    await follower.pass();
    await follower.pass();
    expect(calls).toBe(1);
  });
});

describe('join attempt limit: copy', () => {
  test('the limit line is the agreed Filipino · English wording', () => {
    expect(SYNC.join.tooMany).toBe(
      'Masyadong maraming subok. Maghintay ng 10 minuto. · Too many tries. Wait 10 minutes.',
    );
  });
});
