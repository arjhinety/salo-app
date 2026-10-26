/**
 * Shows a derived event as a local notification (CC-12). Local only: no push token is requested and no push service is
 * used (see the handoff). Android 8+ needs the channel before a notification shows; Android 13+ needs the POST_NOTIFICATIONS
 * permission, which is requested through permission.ts.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { NOTIFY } from '../i18n/notify';
import type { NotifyEvent } from './events';

export const CHANNEL_ID = 'salo-live';

/** Creates the Android channel. Safe to call more than once; a no-op on other platforms. */
export async function setupChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
    name: NOTIFY.channel,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/** Shows one event now. The tap data carries the destination (see tap.ts). */
export async function announce(event: NotifyEvent): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: {
      title: event.title,
      body: event.body,
      data: { href: event.href, kind: event.kind, lotId: event.lotId },
    },
    trigger: { channelId: CHANNEL_ID },
  });
}
