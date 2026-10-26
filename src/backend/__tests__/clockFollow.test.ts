/**
 * Clock follow (M5, test 2 of the brief): a follower's minute is the stored minute plus the real time since the write,
 * divided by the seconds per minute, while the clock runs. A dashboard heartbeat every 10 s keeps it within a minute.
 */
import { LiveEvening, type SharedClock } from '../../live/evening';

const T0 = Date.UTC(2026, 9, 26, 12, 0, 0);
const SPM = 6;

function followingAt(clock: SharedClock, nowMs: number): LiveEvening {
  const live = new LiveEvening();
  live.follow({ policy: 'salo', heldDrivers: [] }, [], clock, nowMs);
  return live;
}

describe('clock follow', () => {
  test('a running row at 17:30 with 30 real seconds since the write reads 17:35 (30 s / 6 s per minute = 5 minutes)', () => {
    const live = followingAt({ minute: 1050, running: true, secondsPerMinute: SPM, updatedAtMs: T0 }, T0 + 30_000);
    expect(live.getSnapshot().minute).toBe(1055);
    expect(live.getSnapshot().running).toBe(true);
  });

  test('the follower keeps moving with its own ticks between heartbeats', () => {
    const live = followingAt({ minute: 1050, running: true, secondsPerMinute: SPM, updatedAtMs: T0 }, T0);
    live.tick(T0 + 60_000);
    expect(live.getSnapshot().minute).toBe(1060);
    live.tick(T0 + 90_000);
    expect(live.getSnapshot().minute).toBe(1065);
  });

  test('a stopped row holds the minute, however long ago it was written', () => {
    const live = followingAt({ minute: 1050, running: false, secondsPerMinute: SPM, updatedAtMs: T0 }, T0 + 600_000);
    expect(live.getSnapshot().minute).toBe(1050);
    expect(live.getSnapshot().running).toBe(false);
    live.tick(T0 + 900_000);
    expect(live.getSnapshot().minute).toBe(1050);
  });

  test('a new row (a seek, a speed change) moves the follower to the stored minute at once', () => {
    const live = followingAt({ minute: 1050, running: true, secondsPerMinute: SPM, updatedAtMs: T0 }, T0 + 6_000);
    live.followClock({ minute: 1020, running: false, secondsPerMinute: SPM, updatedAtMs: T0 + 7_000 }, T0 + 7_000);
    expect(live.getSnapshot().minute).toBe(1020);
    expect(live.getSnapshot().running).toBe(false);
  });

  test('against a dashboard clock sampled every second with a heartbeat every 10 s, the follower is never a minute off', () => {
    // The dashboard starts at 17:00 at 6 s per minute and writes its clock on start and every 10 s after that.
    const dash = new LiveEvening({ secondsPerMinute: SPM, startMinute: 1020 });
    dash.start(T0);
    let row: SharedClock = { minute: 1020, running: true, secondsPerMinute: SPM, updatedAtMs: T0 };
    const follower = followingAt(row, T0);
    let worst = 0;
    for (let s = 1; s <= 900; s++) {
      const now = T0 + s * 1000;
      dash.tick(now);
      if (s % 10 === 0) {
        const snap = dash.getSnapshot();
        row = { minute: snap.minute, running: snap.running, secondsPerMinute: snap.secondsPerMinute, updatedAtMs: now };
        follower.followClock(row, now);
      }
      follower.tick(now);
      worst = Math.max(worst, Math.abs(follower.getSnapshot().minute - dash.getSnapshot().minute));
    }
    expect(worst).toBeLessThanOrEqual(1);
  });
});
