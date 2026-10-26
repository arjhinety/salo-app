/**
 * When to ask for notification permission (CC-12): once, in context, on a donor, pantry or driver phone while the evening
 * is running. Declining is fine: the app works without notifications. Pure decision; the hook does the asking.
 */
import type { Role } from '../backend/types';

export type PermissionState = 'unknown' | 'granted' | 'denied' | 'undetermined';

/** Storage key: set once the in-app reason has been shown, whatever the answer. */
export const ASKED_KEY = 'salo.notify.asked.v1';

/** The roles that receive notifications. Never the dashboard. */
export function eligibleRole(role: Role | null): boolean {
  return role === 'donor' || role === 'pantry' || role === 'driver';
}

export interface AskContext {
  role: Role | null;
  running: boolean;
  state: PermissionState;
  /** null while the stored flag is still being read. */
  asked: boolean | null;
}

/** True when the reason should be shown now: eligible role, clock running, OS still undecided, never asked before. */
export function shouldAskInContext(c: AskContext): boolean {
  return eligibleRole(c.role) && c.running && c.state === 'undetermined' && c.asked === false;
}
