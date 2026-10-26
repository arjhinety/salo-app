/**
 * Live integration test against the real Supabase project `salo` (M5, test 4 of the brief). Skipped unless SYNC_IT=1.
 *
 * Two real anonymous clients in Node: a dashboard and a donor phone. The dashboard runs the real EveningSync (its run
 * row goes through an outbox, as in the app), DashboardSession and the supabase-js SessionApi; the donor runs the real
 * Follower. The test creates a session, reads its join code back, joins with it, moves the shared clock, sends a
 * LOT_POSTED request (and one that must be rejected), waits for the dashboard to apply it, checks that the donor received
 * the session_inputs row over Realtime within 10 s, and compares the two visible logs.
 *
 * It writes rows to the project (a session, its inputs, requests, lots, events, two devices, two anonymous users). The
 * test prints every id it created, so they can be deleted afterwards. It never prints a key.
 */
/** @jest-environment node */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CATALOG } from '../../donor/catalog';
import { lotItemFor } from '../../donor/postForm';
import { LiveEvening, type LiveLotDraft, type SessionInput } from '../../live/evening';
import { DashboardSession } from '../dashboardSession';
import { EveningSync, type RunView } from '../eveningSync';
import { Follower } from '../follower';
import { Outbox, outcomeOf, type KeyValueStore, type OutboxItem, type WriteOutcome } from '../outbox';
import { lotRequest } from '../requests';
import { makeSupabaseSessionApi } from '../sessionApi';
import { digestOf } from './fakeSessionBus';

const RUN = process.env.SYNC_IT === '1';
const describeIt = RUN ? describe : describe.skip;

/** Reads the app's git-ignored .env for the two public settings. The values are never printed. */
function readEnv(): { url: string; key: string } {
  const text = readFileSync(resolve(__dirname, '../../../.env'), 'utf8');
  const get = (name: string) => {
    const line = text.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    if (!line) throw new Error(`${name} is missing from .env`);
    return line.slice(name.length + 1).trim();
  };
  return { url: get('EXPO_PUBLIC_SUPABASE_URL'), key: get('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY') };
}

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return {
    getItem: async (k) => data.get(k) ?? null,
    setItem: async (k, v) => {
      data.set(k, v);
    },
  };
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Polls until the check passes or the time runs out (the Realtime and the writes both take a moment). */
async function waitFor(what: string, check: () => Promise<boolean>, ms = 25_000): Promise<void> {
  const end = Date.now() + ms;
  for (;;) {
    if (await check()) return;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await sleep(300);
  }
}

async function requestRows(client: SupabaseClient, sessionId: string) {
  const res = await client.from('input_requests').select('id, status, reason, applied_seq').eq('session_id', sessionId).order('id');
  return (res.data ?? []) as { id: number; status: string; reason: string | null; applied_seq: number | null }[];
}

describeIt('two phones against the real project (SYNC_IT=1)', () => {
  jest.setTimeout(180_000);

  test('a donor request is applied by the dashboard and replayed on the donor phone; the logs match', async () => {
    const { url, key } = readEnv();
    if (!url.includes('usslrxpftaupvropfkzl')) throw new Error('refusing to run: the URL is not the salo project');
    const opts = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
    const dash: SupabaseClient = createClient(url, key, opts);
    const donor: SupabaseClient = createClient(url, key, opts);

    const created: Record<string, string> = {};
    const dashAuth = await dash.auth.signInAnonymously();
    if (dashAuth.error || !dashAuth.data.user) throw new Error(`dashboard sign-in: ${dashAuth.error?.message}`);
    const donorAuth = await donor.auth.signInAnonymously();
    if (donorAuth.error || !donorAuth.data.user) throw new Error(`donor sign-in: ${donorAuth.error?.message}`);
    const dashUid = dashAuth.data.user.id;
    const donorUid = donorAuth.data.user.id;
    created.dashboardUser = dashUid;
    created.donorUser = donorUid;
    created.windowStartedAt = new Date().toISOString();

    const reg1 = await dash
      .from('devices')
      .upsert({ id: dashUid, role: 'dashboard', profile_id: null }, { onConflict: 'id', ignoreDuplicates: true });
    if (reg1.error) throw new Error(`register dashboard: ${reg1.error.message}`);
    const reg2 = await donor
      .from('devices')
      .upsert({ id: donorUid, role: 'donor', profile_id: 'D01' }, { onConflict: 'id', ignoreDuplicates: true });
    if (reg2.error) throw new Error(`register donor: ${reg2.error.message}`);

    // The dashboard side: the same classes as the app, with a node sender for the outbox.
    const dashApi = makeSupabaseSessionApi(dash, () => dashUid);
    const donorApi = makeSupabaseSessionApi(donor, () => donorUid);
    const outbox = new Outbox(memoryStore(), async (group: OutboxItem[]): Promise<WriteOutcome> => {
      const first = group[0];
      try {
        if (first.kind === 'update') {
          return outcomeOf(await dash.from(first.table).update(first.values!).match(first.match!));
        }
        const rows = group.flatMap((item) => item.rows ?? []);
        return outcomeOf(await dash.from(first.table).upsert(rows, { onConflict: first.onConflict, ignoreDuplicates: true }));
      } catch (error) {
        return { kind: 'retry', reason: error instanceof Error ? error.message : String(error) };
      }
    });
    const liveDash = new LiveEvening();
    const dashboard = new DashboardSession({ api: dashApi, live: liveDash });
    dashboard.start();
    const eveningSync = new EveningSync(liveDash, outbox, {
      userId: () => dashUid,
      role: () => 'dashboard',
      registered: () => true,
    });
    eveningSync.onRunChange((run: RunView | null) => dashboard.onRun(run));
    eveningSync.start();

    // The run row reaches the database, and the dashboard reads its join code back.
    await waitFor('the session row and its join code', async () => {
      await outbox.flush(dashUid);
      await dashboard.pass();
      return dashboard.getStatus().joinCode !== null;
    });
    const joinCode = dashboard.getStatus().joinCode!;
    const sessionId = dashboard.getStatus().sessionId!;
    created.sessionId = sessionId;
    created.joinCode = joinCode;

    // The donor phone joins with the code and replays the session.
    const liveDonor = new LiveEvening();
    const follower = new Follower({ api: donorApi, live: liveDonor, registered: () => true, userId: () => donorUid });
    follower.join(joinCode);
    await follower.pass();
    expect(follower.getStatus().state).toBe('live');

    // A second subscription on the donor's client, to time the Realtime delivery of the input row on its own.
    const deliveredAt = new Map<number, number>();
    const stopTiming = donorApi.subscribe(sessionId, {
      onInput: (i: SessionInput) => deliveredAt.set(i.seq, Date.now()),
    });

    // The dashboard moves the shared clock to 17:31 and pauses. The donor phone follows it.
    liveDash.seek(1051);
    await waitFor('the donor clock at 17:31', async () => {
      await outbox.flush(dashUid);
      await dashboard.pass();
      await follower.pass();
      return liveDonor.getSnapshot().minute === 1051;
    });

    // The donor asks for one lot (accepted) and one with a pickup time in the past (rejected).
    const entry = CATALOG[0];
    const draft = (pickupByMinute: number): LiveLotDraft => ({
      donorId: 'D01',
      items: [lotItemFor({ foodItem: entry.foodItem, unit: entry.unit, quantity: entry.minQty }, entry)],
      pickupByMinute,
    });
    const requestedAt = Date.now();
    follower.send(lotRequest(draft(1200)));
    follower.send(lotRequest(draft(1000)));
    await waitFor('both requests decided', async () => {
      await outbox.flush(dashUid);
      await dashboard.pass();
      await follower.pass();
      const rows = await requestRows(dash, sessionId);
      return rows.length === 2 && rows.every((r) => r.status !== 'pending');
    });
    await waitFor('the donor phone shows the rejection', async () => {
      await follower.pass();
      return follower.getStatus().requests.some((r) => r.status === 'rejected');
    });
    const rejected = follower.getStatus().requests.find((r) => r.status === 'rejected');
    expect(rejected?.reason).toBe('pickup time must be later than the clock');

    // The applied lot is in the session log, and both phones show the same log at 17:31.
    await waitFor('the donor replays the lot', async () => {
      await outbox.flush(dashUid);
      await follower.pass();
      return liveDonor.postedLots().some((l) => l.origin === 'live');
    });
    const seq1At = deliveredAt.get(1);
    expect(seq1At).toBeDefined();
    const latencyMs = (seq1At ?? Number.NaN) - requestedAt;
    expect(latencyMs).toBeLessThan(10_000);
    stopTiming();

    const inputs = await dashApi.readInputs(sessionId);
    expect(inputs.map((i) => i.input.type)).toEqual(['LOT_POSTED']);
    expect(liveDonor.getSnapshot().minute).toBe(liveDash.getSnapshot().minute);
    expect(digestOf(liveDonor.visibleLog())).toBe(digestOf(liveDash.visibleLog()));
    expect(liveDonor.postedLots().map((l) => l.id)).toEqual(liveDash.postedLots().map((l) => l.id));

    // The lots row is written by the outbox too (the database does not link it to the input log).
    await waitFor('the lots row', async () => {
      await outbox.flush(dashUid);
      const lots = await dash.from('lots').select('lot_id').eq('session_id', sessionId);
      return (lots.data ?? []).some((r) => r.lot_id === 'LIVE-1');
    });

    const requests = await requestRows(dash, sessionId);
    process.stdout.write(
      `SYNC_IT created: ${JSON.stringify({
        ...created,
        realtimeLatencyMs: Math.round(latencyMs),
        requests: requests.map((r) => ({ status: r.status, reason: r.reason, appliedSeq: r.applied_seq })),
        logsMatchAtMinute: liveDash.getSnapshot().minute,
        visibleEntries: liveDash.visibleLog().length,
      })}\n`,
    );

    follower.leave();
    dashboard.stop();
    stopTiming();
    await dash.removeAllChannels();
    await donor.removeAllChannels();
    await dash.auth.signOut();
    await donor.auth.signOut();
  });
});
