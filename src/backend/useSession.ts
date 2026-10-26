import { useSyncExternalStore } from 'react';
import { dashboard, follower } from './runtime';
import type { DashboardStatus } from './dashboardSession';
import type { FollowStatus } from './follower';

/** The follower phone's session state and its requests. Re-renders on each change. */
export function useFollowStatus(): FollowStatus {
  return useSyncExternalStore(follower.subscribeStatus, follower.getStatus, follower.getStatus);
}

/** The dashboard's join code and its write warning. */
export function useDashboardStatus(): DashboardStatus {
  return useSyncExternalStore(dashboard.subscribeStatus, dashboard.getStatus, dashboard.getStatus);
}
