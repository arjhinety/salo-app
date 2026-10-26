/**
 * The one Supabase client in the app (decision "Hosted backend: Supabase replaces the laptop", 2026-10-26). It uses the
 * publishable key only. The service-role key never belongs in the app.
 *
 * Auth is anonymous sign-in. The session is stored in expo-sqlite/kv-store. A user has one devices row whose role and
 * profile are immutable (schema), so one phone uses one anonymous user per role: session.ts signs out and signs in again
 * when the role changes.
 */
import { createClient, isAuthRetryableFetchError, type Session, type SupabaseClient } from '@supabase/supabase-js';
import Storage from 'expo-sqlite/kv-store';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../config/server';
import { outcomeOf, type OutboxItem, type WriteOutcome } from './outbox';
import type { Role } from './types';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error('EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be set in the git-ignored .env');
}

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: Storage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

/** The signed-in user's id, kept current by the auth listener. Null when nobody is signed in. */
let user: string | null = null;
supabase.auth.onAuthStateChange((_event, session) => {
  user = session?.user.id ?? null;
});

/** The signed-in user's id, or null. Synchronous. */
export function currentUserId(): string | null {
  return user;
}

/** Reads the stored session once at start (the listener only reports changes). */
export async function restoreSession(): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    user = data.session?.user.id ?? null;
  } catch {
    user = null;
  }
}

/**
 * Returns the stored session, or signs in anonymously once. Throws when the network is down (the caller treats that as
 * offline). A stored session that cannot be refreshed for a reason other than the network is replaced by a new sign-in.
 */
export async function ensureSession(): Promise<Session> {
  const got = await supabase.auth.getSession();
  if (got.error && isAuthRetryableFetchError(got.error)) throw got.error;
  if (got.data.session) return got.data.session;
  const made = await supabase.auth.signInAnonymously();
  if (made.error) throw made.error;
  if (!made.data.session) throw new Error('anonymous sign-in returned no session');
  return made.data.session;
}

/**
 * Upserts this user's devices row (id = auth.uid(), role, profile). Idempotent: an existing row is left as it is. The
 * schema refuses a change of role or profile, so a different role needs a different user (session.ts does that).
 */
export async function registerDevice(role: Role, profileId: string | null): Promise<WriteOutcome> {
  try {
    const session = await ensureSession();
    const res = await supabase
      .from('devices')
      .upsert({ id: session.user.id, role, profile_id: profileId }, { onConflict: 'id', ignoreDuplicates: true });
    return outcomeOf(res);
  } catch (error) {
    return { kind: 'retry', reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Signs out on this device only (no network call), so it also works offline. */
export async function signOutLocal(): Promise<void> {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } finally {
    user = null;
  }
}

/** Headers for POST /functions/v1/parse: the publishable apikey and, when signed in, the user's access token. */
export async function parseAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { apikey: SUPABASE_PUBLISHABLE_KEY };
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.Authorization = `Bearer ${data.session.access_token}`;
  } catch {
    // No session to send: the function answers 401 and the app uses the rule-based fallback.
  }
  return headers;
}

/**
 * Sends one outbox group. Upserts use ON CONFLICT DO NOTHING, so a repeated send is harmless. Never throws: a thrown
 * error means the network failed, so it is a retry.
 */
export async function sendOutboxGroup(group: readonly OutboxItem[]): Promise<WriteOutcome> {
  const first = group[0];
  try {
    if (first.kind === 'update') {
      if (!first.values || !first.match) return { kind: 'rejected', reason: 'update without values or match' };
      const res = await supabase.from(first.table).update(first.values).match(first.match);
      return outcomeOf(res);
    }
    if (!first.onConflict) return { kind: 'rejected', reason: 'upsert without onConflict' };
    const rows = group.flatMap((item) => item.rows ?? []);
    const res = await supabase.from(first.table).upsert(rows, { onConflict: first.onConflict, ignoreDuplicates: true });
    return outcomeOf(res);
  } catch (error) {
    return { kind: 'retry', reason: error instanceof Error ? error.message : String(error) };
  }
}
