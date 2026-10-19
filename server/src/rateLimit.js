// Sliding-window rate limit, global across all callers (no auth yet; see server/README.md).
export function createRateLimiter({ limit, windowMs = 60_000, now = () => Date.now() }) {
  const stamps = [];
  return function take() {
    const t = now();
    while (stamps.length && t - stamps[0] >= windowMs) stamps.shift();
    if (stamps.length >= limit) {
      const retryAfterSec = Math.max(1, Math.ceil((stamps[0] + windowMs - t) / 1000));
      return { allowed: false, retryAfterSec };
    }
    stamps.push(t);
    return { allowed: true, retryAfterSec: 0 };
  };
}
