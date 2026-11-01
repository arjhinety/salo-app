/**
 * The notification hook (CC-12). Mounted once in the root layout. It reads the same visible log as the screens, derives
 * what this phone's profile is owed (events.ts), keeps only the news (tracker.ts), and shows it (deliver.ts). Tapping a
 * notification opens its screen (tap.ts). The dashboard phone and a phone without a role never announce anything.
 *
 * Permission is asked once, in context, when the evening starts on an eligible phone (permission.ts). Without permission
 * the events are still recorded as seen, so granting it later does not flood the phone with the backlog.
 */
import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';
import { router, type Href } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { useEffect, useRef } from 'react';
import { roleState } from '../backend/session';
import { useFollowStatus } from '../backend/useSession';
import { liveEvening, useLiveSnapshot } from '../live/useLive';
import { NOTIFY } from '../i18n/notify';
import { announce, installHandler, setupChannel } from './deliver';
import { notifyEvents, type NotifyEvent } from './events';
import { attachTapRouting, openLastTap } from './tap';
import { NotifyTracker } from './tracker';
import { ASKED_KEY, permissionStateFrom, shouldAskInContext, type PermissionState } from './permission';
import { indexWorld } from '../engine/world';
import { WORLD } from '../data/dataset';
import type { Lot, LotId } from '../engine/types';

const WX = indexWorld(WORLD);

function postedLotMap(): Map<LotId, Lot> {
  return new Map(liveEvening.postedLots().map((l) => [l.id, l]));
}

async function readPermission(): Promise<PermissionState> {
  try {
    const status = await Notifications.getPermissionsAsync();
    return permissionStateFrom(status);
  } catch (error) {
    console.warn('notify: permission could not be read', error);
    return 'unknown';
  }
}

async function readAsked(): Promise<boolean> {
  try {
    return (await Storage.getItem(ASKED_KEY)) === '1';
  } catch (error) {
    console.warn('notify: asked flag could not be read', error);
    return true;
  }
}

async function writeAsked(): Promise<void> {
  try {
    await Storage.setItem(ASKED_KEY, '1');
  } catch (error) {
    console.warn('notify: asked flag not saved', error);
  }
}

/** Mounts the notifications for this phone. Call once, app-wide. */
export function useNotifications(): void {
  const snap = useLiveSnapshot();
  const follow = useFollowStatus();
  const trackerRef = useRef<NotifyTracker | null>(null);
  const permissionRef = useRef<PermissionState>('unknown');
  const askedRef = useRef<boolean | null>(null);
  const handledTaps = useRef(new Set<string>());

  if (trackerRef.current === null) trackerRef.current = new NotifyTracker();

  // Channel, permission state, the stored flag, and the tap routing (warm and cold start).
  useEffect(() => {
    installHandler();
    void (async () => {
      try {
        await setupChannel();
      } catch (error) {
        console.warn('notify: channel not created', error);
      }
      permissionRef.current = await readPermission();
      askedRef.current = await readAsked();
    })();
    const open = (href: string) => router.push(href as Href);
    const detach = attachTapRouting(open);
    openLastTap(open, handledTaps.current);
    return detach;
  }, []);

  // Each change of the clock, the run, or the joined session: derive, keep the news, show it.
  useEffect(() => {
    const { role, profileId } = roleState();
    const follower = liveEvening.isFollower();
    const ctx = [role ?? '', profileId ?? '', snap.policy, follow.sessionId ?? '', follower ? 'f' : 'o'].join('|');
    const events = notifyEvents({
      role,
      profileId,
      log: liveEvening.visibleLog(),
      lots: postedLotMap(),
      now: snap.minute,
      wx: WX,
    });
    const fresh: NotifyEvent[] = trackerRef.current!.step(ctx, snap.minute, follower, events);
    if (fresh.length > 0 && permissionRef.current === 'granted') {
      for (const event of fresh) {
        announce(event).catch((error: unknown) => console.warn('notify: not shown', error));
      }
    }
    if (
      shouldAskInContext({ role, running: snap.running, state: permissionRef.current, asked: askedRef.current })
    ) {
      askedRef.current = true;
      void writeAsked();
      Alert.alert(NOTIFY.permission.title, NOTIFY.permission.body, [
        { text: NOTIFY.permission.later, style: 'cancel' },
        {
          text: NOTIFY.permission.allow,
          onPress: () => {
            void Notifications.requestPermissionsAsync()
              .then((status) => {
                permissionRef.current = status.status;
              })
              .catch((error: unknown) => console.warn('notify: permission request failed', error));
          },
        },
      ]);
    }
  }, [snap, follow.sessionId, follow.state]);
}
