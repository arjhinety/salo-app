/**
 * Which role this phone plays, and getting the signed-in user registered for it.
 *
 * Choosing a role (the picker):
 * - Same role as before: nothing changes; the stored anonymous user stays.
 * - Different role: the run in progress (if any) is released while the old user is still signed in, the phone signs out
 *   on this device, and the next sign-in creates a new anonymous user. That user registers for the new role. (The
 *   devices row cannot change role, so one user cannot play two roles. This is the rule from the schema.)
 *
 * Offline: choosing a role never blocks. The role is stored, and connect() registers the user later, when the network
 * is back.
 */
import type { Session } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { ensureSession, currentUserId, registerDevice, signOutLocal } from './supabase';
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

let state: RoleState = { role: null, profileId: null, registeredUserId: null };

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

/**
 * Sets the role. `release` is called with the signed-in user before a sign-out, so the run in progress is finished and its
 * remaining writes are queued under that user.
 */
export async function chooseRole(role: Role, profileId: string | null, release: (userId: string) => void): Promise<void> {
  if (state.role === role && state.profileId === profileId) return;
  const uid = currentUserId();
  if (uid !== null) release(uid);
  await signOutLocal();
  state = { role, profileId, registeredUserId: null };
  await save();
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
