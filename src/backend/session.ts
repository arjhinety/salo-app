/**
 * Which role this phone plays, and getting the signed-in user registered for it.
 *
 * Choosing a role (the picker or the driver screen):
 * - Same role and profile as before, with nothing kept for it: nothing changes; the stored anonymous user stays.
 * - Different role or profile: the run in progress (if any) is released while the old user is still signed in, and the
 *   outgoing user's queued writes get up to 5 s to be sent (runtime.ts). Writes that are still queued keep that user's
 *   session on this device, under the role and profile it was registered for, so they are sent when that role is chosen
 *   again. Then the phone signs out on this device. A kept session for the chosen role is put back; otherwise the next
 *   sign-in creates a new anonymous user, which registers for the role. (The devices row cannot change role or profile,
 *   so one user cannot play two roles. This is the rule from the schema.)
 *
 * Offline: choosing a role never blocks. The role is stored, and connect() registers the user later, when the network
 * is back. A kept session that cannot be put back yet stays kept, and is tried again the next time its role is chosen.
 */
import type { Session } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { ensureSession, currentUserId, registerDevice, restoreKeptSession, sessionTokens, signOutLocal } from './supabase';
import type { Role } from './types';

export interface RoleState {
  role: Role | null;
  /** donor: "D01" and the like. Null for dashboard. */
  profileId: string | null;
  /** The user id this role was registered for, or null while that is still to do. */
  registeredUserId: string | null;
}

export type ConnectResult = 'idle' | 'ok' | 'offline' | 'rejected';

export const ROLE_STATE_KEY = 'salo.backend.role.v1';
/** Sessions kept on this device, by user id, for writes still queued after their role was left. */
export const KEPT_SESSIONS_KEY = 'salo.backend.kept.v1';

/** A kept session. `roleKey` is the role and profile it was registered for; `registered`: it was registered then. */
interface KeptSession {
  userId: string;
  roleKey: string;
  accessToken: string;
  refreshToken: string;
  registered: boolean;
}

type KeptMap = Record<string, KeptSession>;

let state: RoleState = { role: null, profileId: null, registeredUserId: null };

/**
 * Called before a role change signs the user out, with that user's id. Returns true when the user's writes are still
 * queued (then the session is kept). Anything else means not kept.
 */
export type BeforeSignOut = (userId: string) => unknown;

/** Loads the stored role state. Call once at start. */
export async function loadRoleState(): Promise<void> {
  try {
    const raw = await Storage.getItem(ROLE_STATE_KEY);
    if (raw) state = { ...state, ...(JSON.parse(raw) as RoleState) };
  } catch (error) {
    console.warn('backend: role state could not be read', error);
  }
}

export function roleState(): Readonly<RoleState> {
  return state;
}

/** True when the signed-in user is registered for the chosen role. */
export function isRegistered(): boolean {
  const uid = currentUserId();
  return uid !== null && state.registeredUserId === uid;
}

async function save(): Promise<void> {
  try {
    await Storage.setItem(ROLE_STATE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('backend: role state not saved', error);
  }
}

function roleKey(role: Role | null, profileId: string | null): string {
  return `${role ?? ''}:${profileId ?? ''}`;
}

async function readKept(): Promise<KeptMap> {
  try {
    const raw = await Storage.getItem(KEPT_SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as KeptMap) : {};
  } catch (error) {
    console.warn('backend: kept sessions could not be read', error);
    return {};
  }
}

async function writeKept(kept: KeptMap): Promise<void> {
  try {
    await Storage.setItem(KEPT_SESSIONS_KEY, JSON.stringify(kept));
  } catch (error) {
    console.warn('backend: kept sessions not saved', error);
  }
}

/**
 * Sets the role. `beforeSignOut` runs with the signed-in user before the sign-out: the run is released and the queued
 * writes get their chance to be sent. It returns true when that user's writes are still queued; then the session is kept.
 */
export async function chooseRole(role: Role, profileId: string | null, beforeSignOut: BeforeSignOut): Promise<void> {
  const key = roleKey(role, profileId);
  const sameRole = state.role === role && state.profileId === profileId;
  if (sameRole && !Object.values(await readKept()).some((k) => k.roleKey === key)) return;

  const uid = currentUserId();
  if (uid !== null) {
    const keep = await beforeSignOut(uid);
    if (keep === true) await keepCurrentSession(uid);
  }
  await signOutLocal();
  const restored = await restoreFor(key);
  state = { role, profileId, registeredUserId: restored?.registered ? restored.userId : null };
  await save();
}

/** Keeps the signed-in session under the role it was registered for, so its queued writes can be sent later. */
async function keepCurrentSession(userId: string): Promise<void> {
  const tokens = await sessionTokens();
  if (tokens === null || tokens.userId !== userId) return;
  const kept = await readKept();
  kept[userId] = {
    userId,
    roleKey: roleKey(state.role, state.profileId),
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    registered: state.registeredUserId === userId,
  };
  await writeKept(kept);
}

/**
 * Puts back one kept session for this role and profile, if there is one. Returns what was restored, or null. A kept
 * session that cannot be restored (for example offline) stays kept.
 */
async function restoreFor(key: string): Promise<{ userId: string; registered: boolean } | null> {
  const kept = await readKept();
  for (const entry of Object.values(kept).filter((k) => k.roleKey === key)) {
    const userId = await restoreKeptSession(entry.accessToken, entry.refreshToken);
    if (userId !== entry.userId) continue;
    delete kept[entry.userId];
    await writeKept(kept);
    return { userId, registered: entry.registered };
  }
  return null;
}

/** Forgets the kept sessions of these users (an explicit discard of their queued writes). */
export async function forgetKeptSessions(userIds: readonly string[]): Promise<void> {
  const kept = await readKept();
  let changed = false;
  for (const userId of userIds) {
    if (kept[userId]) {
      delete kept[userId];
      changed = true;
    }
  }
  if (changed) await writeKept(kept);
}

/**
 * Makes sure there is a signed-in user and that it is registered for the chosen role. Never throws.
 * `ok`: registered. `offline`: try again later. `rejected`: the server refused the registration (for example an unknown
 * donor), so retrying the same request will not help; the reason is logged.
 */
export async function connect(): Promise<ConnectResult> {
  if (state.role === null) return 'idle';
  let session: Session;
  try {
    session = await ensureSession();
  } catch {
    return 'offline';
  }
  if (state.registeredUserId === session.user.id) return 'ok';
  const role = state.role;
  const out = await registerDevice(role, state.profileId);
  if (out.kind === 'ok') {
    state = { ...state, registeredUserId: session.user.id };
    await save();
    return 'ok';
  }
  if (out.kind === 'retry') return 'offline';
  console.warn(`backend: device registration refused: ${out.reason}`);
  return 'rejected';
}
