/** Display helpers for the pantry screens. Pure: they take numbers and return text. */
import { PANTRY_COPY, twoDp, type WhyFill } from '../i18n/pantry';
import type { Minute } from '../engine/types';
import type { PantryStatus, ValueParts } from './model';

/** Clock text, e.g. 1125 becomes "6:45 PM" (same style as the donor screens). */
export function clockText(m: Minute): string {
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${h > 12 ? h - 12 : h}:${mm} ${h >= 12 ? 'PM' : 'AM'}`;
}

/** Road distance to one decimal, e.g. 1.1. */
export function kmText(km: number): string {
  return (Math.round(km * 10) / 10).toFixed(1);
}

/** The numbers for the "why" sentence (PAN-07). Every value is the already-rounded display value. */
export function whyFill(name: string, value: ValueParts, shares: number, sharesLeftNow: number, km: number): WhyFill {
  return {
    name,
    need: twoDp(value.need),
    storage: twoDp(value.storage),
    distance: twoDp(value.distance),
    freshness: twoDp(value.freshness),
    total: twoDp(value.total),
    shares: String(shares),
    left: String(sharesLeftNow),
    km: kmText(km),
  };
}

/**
 * The PAN-07 sentence for a status, filled from the numbers. Refused lots have no value, so they get no sentence
 * here; the refusal reason is shown on its own line.
 */
export function whySentence(status: PantryStatus, f: WhyFill): string | null {
  switch (status) {
    case 'tentative':
    case 'final':
    case 'delivered':
    case 'stranded':
      return PANTRY_COPY.whyLine.won(f);
    case 'outbid':
      return PANTRY_COPY.whyLine.outbid(f);
    case 'bidding':
      return PANTRY_COPY.whyLine.bidding(f);
    case 'refused':
      return null;
  }
}
