import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/** The part of AccessibilityInfo this module uses. A fake can stand in for it in tests. */
export interface MotionSource {
  isReduceMotionEnabled(): Promise<boolean>;
  addEventListener(event: 'reduceMotionChanged', handler: (enabled: boolean) => void): { remove(): void };
}

/**
 * Follows the OS "Remove animations" setting. Calls onChange with the setting now and after every change, and returns
 * the unsubscribe. A change event that arrives before the first answer wins, so an old answer never overwrites it.
 * A failed query keeps the default (motion on), which is the behaviour before this module existed.
 */
export function watchReduceMotion(source: MotionSource, onChange: (enabled: boolean) => void): () => void {
  let active = true;
  let changes = 0;
  const subscription = source.addEventListener('reduceMotionChanged', (enabled) => {
    if (!active) return;
    changes++;
    onChange(enabled);
  });
  const changesWhenAsked = changes;
  source.isReduceMotionEnabled().then(
    (enabled) => {
      if (active && changes === changesWhenAsked) onChange(enabled);
    },
    () => {
      // Keep the last known value.
    },
  );
  return () => {
    active = false;
    subscription.remove();
  };
}

/** True while the phone asks for less motion. Every animation in the app reads this (through the theme). */
export function useReduceMotion(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => watchReduceMotion(AccessibilityInfo, setEnabled), []);
  return enabled;
}
