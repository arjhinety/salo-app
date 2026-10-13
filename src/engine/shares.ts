/**
 * Decision D-Q2: shares = min(shares left, round(scale x value)). With scale 17, Bukal (0.82) bids 14.
 * Decision D-Q4: only a winning bid spends shares; the caller subtracts it at TENTATIVE_ACCEPT.
 */
export function shareBid(value: number, scale: number, sharesLeft: number): number {
  return Math.max(0, Math.min(sharesLeft, Math.round(scale * value)));
}
