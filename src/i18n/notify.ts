/**
 * Local notification copy (CC-12). Filipino first, English after " · ". Every string is listed verbatim in
 * docs/handoffs/2026-10-26-mobile-native-notifications.md for the Codex review (Taglish copy).
 */
export const NOTIFY = {
  channel: 'Mga abiso ng Salo · Salo alerts',
  simTag: '(simulasyon · simulation)',
  permission: {
    title: 'Gusto mo ba ng abiso? · Want alerts?',
    body: 'Sasabihan ka namin kapag may bagong request o pagbabago sa lot mo habang bukas ang app. Puwede itong i-off sa settings ng telepono. · We will tell you when a new request or a change to your lot comes in while the app is open. You can turn this off in the phone settings.',
    allow: 'Payagan · Allow',
    later: 'Hindi ngayon · Not now',
  },
  driverAsk: {
    title: 'May request para sa iyo · A request for you',
    body: (lot: string, closes: string) => `Lot ${lot}: sumagot bago ang ${closes} · Lot ${lot}: reply before ${closes}`,
  },
  donorTentative: {
    title: 'Napili na ang pantry · A pantry was picked',
    body: (lot: string, pantry: string) =>
      `Lot ${lot}: ${pantry} muna, hanggang may driver · Lot ${lot}: ${pantry} for now, until a driver commits`,
  },
  donorCommit: {
    title: 'May driver na ang lot mo · A driver is committed to your lot',
    body: (lot: string, driver: string, eta: string) =>
      `Lot ${lot}: maghahatid si ${driver}, dadating ng ${eta} · Lot ${lot}: ${driver} delivers, arriving ${eta}`,
  },
  pantryTentative: {
    title: 'Nakalaan sa inyo ang lot · A lot is held for your pantry',
    body: (lot: string, donor: string) =>
      `Lot ${lot} mula sa ${donor}: nakalaan muna hanggang may driver · Lot ${lot} from ${donor}: held until a driver commits`,
  },
  pantryFinal: {
    title: 'Final na ang lot · A lot is final',
    body: (lot: string, driver: string) => `Lot ${lot}: may driver na, si ${driver} · Lot ${lot}: a driver is committed, ${driver}`,
  },
} as const;
