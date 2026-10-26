/**
 * Decides which derived events are news (CC-12). Pure: no React, no Expo.
 *
 * Each event is announced once (dedupe by its key). An event is news only when the phone saw it arrive live: the same
 * context (role, profile, policy, joined session) and the clock moved forward by at most MAX_LIVE_STEP minutes since the
 * last look. Anything else is a jump, and the events visible after a jump are recorded as seen without announcing them:
 * the first look on open, a join, a policy change, a rewind, or a scrub forward.
 *
 * A follower's clock follows the dashboard's clock, so a catch-up after a lost connection is news and is announced.
 * Only a single phone can scrub, so only a single phone's jump is treated as a scrub.
 */
import type { NotifyEvent } from './events';

/** Largest forward step of the visible minute that still counts as live on a single phone. */
export const MAX_LIVE_STEP = 3;

export class NotifyTracker {
  private readonly seen = new Set<string>();
  private last: { ctx: string; minute: number } | null = null;

  /**
   * One look at the evening. `ctx` identifies the role, profile, policy and joined session; `minute` is the whole minute
   * on the clock; `follower` is true when this phone follows a session. Returns the events to announce now, in order.
   */
  step(ctx: string, minute: number, follower: boolean, events: readonly NotifyEvent[]): NotifyEvent[] {
    const last = this.last;
    this.last = { ctx, minute };
    const step = last === null ? Number.NaN : minute - last.minute;
    const live = last !== null && last.ctx === ctx && step >= 0 && (follower || step <= MAX_LIVE_STEP);
    if (!live) {
      for (const e of events) this.seen.add(e.key);
      return [];
    }
    const fresh: NotifyEvent[] = [];
    for (const e of events) {
      if (this.seen.has(e.key)) continue;
      this.seen.add(e.key);
      fresh.push(e);
    }
    return fresh;
  }

  /** How many events are recorded as seen (for tests and the handoff). */
  get seenCount(): number {
    return this.seen.size;
  }
}
