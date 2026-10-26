/**
 * Pantry coordinator copy (PAN-01 to PAN-07). Filipino first, English after " · ", as in src/i18n/strings.ts.
 * Written by Claude; Codex reviews the Filipino (decision log, CC-05). Every number on these screens is filled in
 * from the engine's event log. Nothing here is generated text.
 */
import type { RefuseReason } from '../engine/types';
import type { PantryStatus, PartKey } from '../pantry/model';

export const PANTRY_UNITS_EN: Record<string, string> = {
  tray: 'trays',
  piece: 'pieces',
  bilao: 'bilao',
  kg: 'kg',
  loaf: 'loaves',
  pot: 'pots',
  pack: 'packs',
  can: 'cans',
};

export const PANTRY_UNITS_FIL: Record<string, string> = {
  tray: 'tray',
  piece: 'piraso',
  bilao: 'bilao',
  kg: 'kg',
  loaf: 'tinapay',
  pot: 'kaldero',
  pack: 'pakete',
  can: 'lata',
};

/** The numbers the "why" sentence needs. All values are already formatted for display. */
export interface WhyFill {
  name: string;
  need: string;
  storage: string;
  distance: string;
  freshness: string;
  total: string;
  shares: string;
  left: string;
  km: string;
}

export const PANTRY_COPY = {
  home: { fil: 'Mga lot ngayong gabi', en: 'Lots tonight' },
  back: { fil: 'Bumalik', en: 'Back' },
  openLot: 'Buksan ang detalye ng lot. · Open the lot details.',
  budget: {
    line: (left: number, total: number) => `Shares na natira: ${left} sa ${total}. · Shares left: ${left} of ${total}.`,
    note: 'Para ito sa gabing ito. Ang nanalong bid lang ang nagbabawas. · These are for tonight. Only a winning bid uses them up.',
  },
  awards: { fil: 'Mga lot na na-award sa amin', en: 'My awards' },
  open: { fil: 'Mga lot na puwedeng i-bid', en: 'Open lots' },
  noOpen: { fil: 'Walang lot na puwedeng i-bid ngayon.', en: 'No open lots right now.' },
  noAwards: { fil: 'Wala pang na-award na lot sa pantry na ito.', en: 'This pantry has no award yet.' },
  unknownPantry: {
    fil: 'Hindi namin mahanap ang pantry na ito.',
    en: 'We could not find this pantry.',
  },
  lotNotFound: {
    fil: 'Wala pa ang lot na ito ngayong gabi.',
    en: 'This lot is not posted yet tonight.',
  },
  fields: {
    amount: { fil: 'Dami', en: 'Amount' },
    storage: { fil: 'Imbakan', en: 'Storage' },
    pickupBy: { fil: 'Kunin bago', en: 'Pick up by' },
    distance: { fil: 'Layo', en: 'Distance' },
  },
  fridge: {
    pantryHas: 'May ref ang pantry · The pantry has a fridge',
    pantryNone: 'Walang ref ang pantry · The pantry has no fridge',
  },
  storage: {
    fridge: 'Kailangan ng ref kung itatabi · Needs a fridge if kept',
    dry: 'Hindi kailangan ng ref · No fridge needed',
  },
  amountLine: (qty: number, unitFil: string, unitEn: string) => `${qty} ${unitFil} · ${qty} ${unitEn}`,
  /** One labelled fact on a tag or detail, e.g. "Dami · Amount: 3 tray · 3 trays". */
  fact: {
    amount: (v: string) => `Dami · Amount: ${v}`,
    storage: (v: string) => `Imbakan · Storage: ${v}`,
    pickupBy: (v: string) => `Kunin bago · Pick up by: ${v}`,
    distance: (km: string) => `Layo · Distance: ${km} km`,
    lot: (id: string) => `Lot ${id}`,
  },
  pickupBy: (time: string) => `Kunin bago ${time} · Pick up by ${time}`,
  /** The four parts of the pantry's value (PAN-02). Same order as the engine's breakdown. */
  parts: {
    need: { fil: 'Kailangan ngayong gabi', en: 'Need tonight' },
    storage: { fil: 'Kayang itabi', en: 'Can store' },
    distance: { fil: 'Layo', en: 'Distance' },
    freshness: { fil: 'Sariwa pa', en: 'Freshness' },
    total: { fil: 'Kabuuan', en: 'Total' },
  } as Record<PartKey | 'total', { fil: string; en: string }>,
  value: {
    heading: { fil: 'Value ng lot para sa pantry', en: 'Value of this lot for the pantry' },
    bidShares: (n: number) => `Shares na na-bid: ${n} · Shares bid: ${n}`,
    sharesLeft: (n: number) => `Shares na natira: ${n} · Shares left: ${n}`,
    auto: 'Awtomatikong nag-bid ang agent ng pantry. Hindi mababago ng coordinator ang bid sa bersyong ito. · The pantry agent bids automatically. The coordinator sees the bid and cannot change it in v1.',
    noValue: 'Walang value: tinanggihan ang lot. · No value: the lot was refused.',
    noBidYet: 'Hindi pa nag-bid ang agent. · The agent has not bid yet.',
  },
  why: {
    heading: 'Bakit sa amin ito? · Why did you get this lot?',
  },
  /** The status words on a tag and on the detail screen. The English word is the sticker; the line is the detail. */
  status: {
    bidding: { sticker: 'BIDDING', fil: 'Nagbi-bid', en: 'Bidding', detail: 'Nagbi-bid ang agent ng pantry. Bukas pa ang round. · The pantry agent is bidding. The round is still open.' },
    outbid: { sticker: 'OUTBID', fil: 'Natalo sa bid', en: 'Outbid', detail: 'May ibang pantry na mas mataas ang bid. · Another pantry bid higher.' },
    tentative: { sticker: 'TENTATIVE', fil: 'Tentative', en: 'Tentative', detail: 'Hawak muna hanggang may driver na mag-confirm · Held until a driver commits' },
    final: { sticker: 'FINAL', fil: 'Final', en: 'Final', detail: 'Pinal na ang award: may driver nang nag-commit. · Award is final: a driver has committed.' },
    delivered: { sticker: 'DELIVERED', fil: 'Naihatid', en: 'Delivered', detail: 'Naihatid na ang lot. · The lot has been delivered.' },
    stranded: { sticker: 'STRANDED', fil: 'Hindi naihatid', en: 'Not delivered', detail: 'Walang driver na nag-commit bago ang takdang oras. · No driver committed in time.' },
    refused: { sticker: 'REFUSED', fil: 'Tinanggihan', en: 'Refused', detail: 'Hindi kayang tanggapin ng pantry ang lot na ito. · The pantry cannot take this lot.' },
  } as Record<PantryStatus, { sticker: string; fil: string; en: string; detail: string }>,
  /** Shown when a driver failed after the pantry's award (PAN-06). The pantry is never asked to bid again. */
  reannounced: {
    tentative: 'Umatras ang naunang driver. Inanunsyo ulit ang delivery; nakalaan pa rin sa pantry ang lot. · The earlier driver withdrew. The delivery is re-announced; the pantry keeps its tentative award.',
    committed: 'Umatras ang naunang driver; may bagong driver na nag-commit. · The earlier driver withdrew; a new driver committed.',
  },
  refuse: {
    closed_before_earliest_arrival: { fil: 'Sarado na ang pantry bago pa makarating ang sinumang driver.', en: 'Closed before any driver could arrive.' },
    cannot_store_lot: { fil: 'Hindi kasya sa tuyong imbakan o sa ref.', en: 'Too big for dry and fridge storage.' },
    no_remaining_need: { fil: 'Wala nang kailangan ngayong araw.', en: 'No remaining need today.' },
    no_shares_left: { fil: 'Wala nang natitirang shares ngayong gabi.', en: 'No shares left tonight.' },
  } as Record<RefuseReason, { fil: string; en: string }>,
  /**
   * PAN-07: "Why did you get this lot?" Each sentence is a fixed template filled with the numbers.
   */
  whyLine: {
    won: (f: WhyFill) =>
      `${f.name} ang nakakuha ng lot dahil pinakamataas ang bid nito: ${f.shares} shares batay sa value na ${f.total} ` +
      `(kailangan: ${f.need} + imbakan: ${f.storage} + layo: ${f.distance} + pagkasariwa: ${f.freshness}). Natitirang shares: ${f.left}. Layo: ${f.km} km. · ` +
      `${f.name} got this lot because its bid was the highest: ${f.shares} shares from a value of ${f.total} ` +
      `(${f.need} need + ${f.storage} storage + ${f.distance} distance + ${f.freshness} freshness). Shares left now: ${f.left}. Distance: ${f.km} km.`,
    outbid: (f: WhyFill) =>
      `Nag-bid ang ${f.name} ng ${f.shares} shares batay sa value na ${f.total}, pero mas mataas ang bid ng ibang pantry. Natitirang shares: ${f.left}. · ` +
      `${f.name} bid ${f.shares} shares from a value of ${f.total}, but another pantry's bid was higher. Shares left now: ${f.left}.`,
    bidding: (f: WhyFill) =>
      `Nag-bid ang ${f.name} ng ${f.shares} shares batay sa value na ${f.total}. Bukas pa ang round. · ` +
      `${f.name} has bid ${f.shares} shares from a value of ${f.total}. The round is still open.`,
  },
} as const;

/** Two-decimal text for a value part or total. */
export const twoDp = (x: number): string => x.toFixed(2);
