import type { FollowStatus } from './follower';

/**
 * What a follower screen does with its actions (M5):
 * - `local`: this phone is not joined. It keeps its own inputs, as in single-phone mode (CC-02, D-i).
 * - `joined`: this phone follows a session. Its actions are requests to the dashboard.
 * - `blocked`: the phone is joining or its session ended. No action is taken until it joins again.
 */
export type SessionMode = 'local' | 'joined' | 'blocked';

export function sessionMode(status: Pick<FollowStatus, 'state'>): SessionMode {
  if (status.state === 'idle' || status.state === 'refused') return 'local';
  if (status.state === 'live' || status.state === 'offline') return 'joined';
  return 'blocked';
}
