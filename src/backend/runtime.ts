/**
 * The app's backend wiring: one outbox, one evening sync, one background loop. Screens use the functions here and never
 * the Supabase client directly.
 *
 * Loop (every 3 s, one pass at a time): connect if a role is chosen but not registered, then reconcile the evening into the
 * outbox, then flush the outbox. A pass with nothing to do makes no network call.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { liveEvening } from '../live/useLive';
import { EveningSync, type Identity } from './eveningSync';
import { Outbox, type OutboxStatus, type WriteOutcome, type OutboxItem } from './outbox';
import { chooseRole, connect, forgetKeptSessions, isRegistered, loadRoleState, roleState, type ConnectResult } from './session';
import { currentUserId, restoreSession, sendOutboxGroup, supabase } from './supabase';
import { DashboardSession } from './dashboardSession';
import { Follower } from './follower';
import { makeSupabaseSessionApi } from './sessionApi';
import Storage from 'expo-sqlite/kv-store';
import type { Role } from './types';

export const LOOP_MS = 3000;
/** How long a role change waits for the queued writes of the user it signs out (see session.ts). */
export const FLUSH_BEFORE_SIGN_OUT_MS = 5000;

const sendGroup = (group: OutboxItem[]): Promise<WriteOutcome> => sendOutboxGroup(group);

export const outbox = new Outbox(Storage, sendGroup);

const identity: Identity = {
  userId: currentUserId,
  role: () => roleState().role,
  registered: isRegistered,
};

export const eveningSync = new EveningSync(liveEvening, outbox, identity);

/** The two-phone session (M5). The dashboard writes it; a joined phone follows it. Both use the same live store. */
export const sessionApi = makeSupabaseSessionApi(supabase, currentUserId);
export const dashboard = new DashboardSession({ api: sessionApi, live: liveEvening });
export const follower = new Follower({ api: sessionApi, live: liveEvening, registered: isRegistered, userId: currentUserId });

let booting: Promise<void> | null = null;
let busy = false;
/** Set when the server refused the registration for the current role. Cleared by a role change. */
let refusedRole: string | null = null;

/** Loads the stored state once, subscribes the evening sync, and starts the loop. Idempotent. */
export function startBackend(): Promise<void> {
  booting ??= (async () => {
    await restoreSession();
    await loadRoleState();
    await outbox.load();
    dashboard.start();
    eveningSync.onRunChange((run) => dashboard.onRun(run));
    eveningSync.start();
    setInterval(() => void pass(), LOOP_MS);
    void pass();
  })();
  return booting;
}

/** One pass of the loop. Never overlaps itself. */
export async function pass(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    const role = roleState().role;
    if (role !== null && !isRegistered() && refusedRole !== `${role}:${roleState().profileId}`) {
      const result = await connect();
      setOnlineFrom(result);
      if (result === 'rejected') refusedRole = `${role}:${roleState().profileId}`;
    }
    eveningSync.reconcile();
    await outbox.flush(currentUserId());
    await dashboard.pass();
    await follower.pass();
  } finally {
    busy = false;
  }
}

function setOnlineFrom(result: ConnectResult): void {
  if (result === 'ok') outbox.setOnline(true);
  else if (result === 'offline') outbox.setOnline(false);
}

/**
 * The picker's action. Chooses the role (signing out first when it changes), then tries to connect. The caller may stop
 * waiting after a short time; the loop keeps trying in the background.
 *
 * Before a sign-out: the run is released, then the outgoing user's queued writes are sent for up to 5 s. Writes that are
 * still queued are not dropped: their session is kept (session.ts) and the picker shows how many are waiting.
 */
export async function pickRole(role: Role, profileId: string | null): Promise<void> {
  refusedRole = null;
  await chooseRole(role, profileId, async (uid) => {
    eveningSync.release(uid);
    const sent = await outbox.flushWithin(uid, FLUSH_BEFORE_SIGN_OUT_MS);
    if (sent === 'timeout') console.warn('backend: queued writes not sent before the role change; they are kept');
    return outbox.queuedFor(uid) > 0;
  });
  setOnlineFrom(await connect());
  eveningSync.reconcile();
}

/**
 * Writes queued for a user other than the one signed in now. The picker shows the count and offers to discard them. Only
 * the explicit discard removes them.
 */
export function useStrandedOutbox(): { count: number; discard: () => void } {
  useBackendStatus();
  const uid = currentUserId();
  return {
    count: outbox.strandedCount(uid),
    discard: () => {
      const gone = outbox.discardStranded(uid);
      void forgetKeptSessions(gone.userIds);
    },
  };
}

/** Starts a new run (used by "Replay with baseline" before the replay is applied). */
export function startNewRun(): void {
  eveningSync.beginRun();
}

/** Subscribes a screen to the outbox status (queued, online). */
export function useBackendStatus(): OutboxStatus {
  return useSyncExternalStore(outbox.subscribe, outbox.getStatus, outbox.getStatus);
}

/** Mounts the backend once, app-wide. Called from the root layout. */
export function useBackendSync(): void {
  useEffect(() => {
    void startBackend();
  }, []);
}
