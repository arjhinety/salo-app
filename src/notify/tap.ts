/**
 * Tap routing for the local notifications (CC-12). A tap carries its destination in `data.href` (see events.ts). Only the
 * three screens the notifications are about are accepted; any other value is ignored.
 */
import * as Notifications from 'expo-notifications';

const ALLOWED: readonly RegExp[] = [
  /^\/donor$/,
  /^\/driver$/,
  /^\/pantry\/lot\/[^/?]+\?profile=[^&]+$/,
];

/** The href in a notification's data, if it is one of the allowed destinations. */
export function hrefFromData(data: unknown): string | null {
  if (typeof data !== 'object' || data === null) return null;
  const href = (data as { href?: unknown }).href;
  if (typeof href !== 'string') return null;
  return ALLOWED.some((re) => re.test(href)) ? href : null;
}

/** Opens the destination of every tap while mounted. Returns the cleanup. */
export function attachTapRouting(open: (href: string) => void): () => void {
  const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
    const href = hrefFromData(response.notification.request.content.data);
    if (href !== null) open(href);
  });
  return () => subscription.remove();
}

/**
 * The tap that started the app, if any (cold start). Opened once per notification identifier: `handled` records the ones
 * already opened, so a re-mount does not open the same tap twice.
 */
export function openLastTap(open: (href: string) => void, handled: Set<string>): void {
  const response = Notifications.getLastNotificationResponse();
  if (!response) return;
  const id = response.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  const href = hrefFromData(response.notification.request.content.data);
  if (href !== null) open(href);
}
