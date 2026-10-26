/**
 * The call shape of session_driver_members (migration 20261026120000): the RPC name, its one argument (p_session), how the
 * rows map to driver members, and how a database refusal (42501: not the creator) becomes a refused SessionError.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { makeSupabaseSessionApi, SessionError } from '../sessionApi';

describe('session_driver_members RPC call', () => {
  test('calls the RPC with p_session, maps the rows to driver members, and maps a refusal to a refused SessionError', async () => {
    const calls: { name: string; args: unknown }[] = [];
    const rows = [{ device_id: 'dev-1', driver_id: 'V19', joined_at: '2026-10-26T09:00:00+00:00' }];
    const ok = {
      rpc: (name: string, args: unknown) => {
        calls.push({ name, args });
        return Promise.resolve({ data: rows, error: null });
      },
    };
    const api = makeSupabaseSessionApi(ok as unknown as SupabaseClient, () => 'dash');
    await expect(api.readDriverMembers('sess-1')).resolves.toEqual([{ deviceId: 'dev-1', driverId: 'V19' }]);
    expect(calls).toEqual([{ name: 'session_driver_members', args: { p_session: 'sess-1' } }]);

    const refused = {
      rpc: () =>
        Promise.resolve({
          data: null,
          error: { code: '42501', message: 'session_driver_members: only the session creator can read its members' },
        }),
    };
    const api2 = makeSupabaseSessionApi(refused as unknown as SupabaseClient, () => 'donor');
    const error = await api2.readDriverMembers('sess-1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SessionError);
    expect((error as SessionError).kind).toBe('refused');
  });
});
