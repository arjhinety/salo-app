/**
 * Driver screen copy (mobile-feature, DRV-01 to DRV-06). Filipino first, English after " · ".
 * Each string is shown as the Filipino line with the English line beneath it (CC-05). Times come in as "h:mm AM/PM".
 * Reviewed by Codex after any Taglish change (docs/handoffs/2026-10-26-mobile-feature-driver.md has every string).
 */
export const DRV = {
  title: 'Tagahatid · Volunteer driver',
  simNote: 'Kathang-isip at simulasyon ang lahat ng tagahatid, lugar at numero dito · Every driver, place and number here is fictional or simulated',
  chooserLabel: 'Sino ka sa simulasyon? · Who are you in the simulation?',
  chooserHint: 'Pumili ng tagahatid na may hiling. Ikaw ang napili · Choose a driver who gets requests. You hold the one you choose',
  chooserItem: (name: string) => `Piliin si ${name} · Choose ${name}`,
  requests: 'Mga hiling · Requests',
  requestsEmpty: 'Walang hiling sa ngayon · No requests right now',
  requestsEmptyHint: 'Lilitaw dito ang hiling kapag tinawag ka ng orasan ng simulasyon · A request appears here when the simulated clock calls you',
  pickupFrom: 'Kunin kay · Pick up at',
  dropoffAt: 'Ihatid kay · Drop off at',
  before: (t: string) => `bago mag-${t} · before ${t}`,
  window: (n: number) => `Sumagot sa loob ng ${n} min · Reply within ${n} min`,
  offer: 'Mag-alok · Offer to deliver',
  offerNo: 'Hindi ka aabot bago ang oras · You cannot arrive before the deadline',
  decline: 'Tanggihan · Decline',
  offered: (t: string) => `Naialok · Offered, by ${t}`,
  picked: (n: number) => `Napili ka, i-commit sa loob ng ${n} min · You were picked, commit within ${n} min`,
  commit: 'I-commit · Commit',
  withdraw: 'Bawiin · Withdraw',
  withdrawWarn: 'Mabibilang itong takbong hindi natuloy · Counts as a missed run',
  notPicked: 'Hindi napili · Not picked',
  notPickedHint: 'May ibang tagahatid na nanalo sa lot na ito · Another driver won this lot',
  committed: (t: string) => `Naka-commit, maghahatid bago ang ${t} · Committed, delivers before the ${t} pickup deadline`,
  runs: 'Mga takbo ko · My runs',
  runsEmpty: 'Wala ka pang takbo · No runs yet',
  pickedUp: (t: string) => `Nakuha ng ${t} · Picked up at ${t}`,
  delivered: (t: string) => `Naihatid ng ${t} · Delivered at ${t}`,
  onTime: 'Sa oras · On time',
  late: 'Huli na · Late',
  notYet: 'Hindi pa naihahatid · Not delivered yet',
  withdrewStatus: 'Binawi mo · You withdrew',
  noReplyStatus: 'Hindi nakapag-commit sa oras · No commit in time',
  cancelledStatus: 'Kinansela ng operator · Cancelled by the operator',
  missedNote: 'Bilang na hindi natuloy · Counts as a missed run',
  stickerRequest: 'Hiling · Request',
  stickerPicked: 'Napili · Picked',
  stickerCommitted: 'Naka-commit · Committed',
  stickerDelivered: 'Naihatid · Delivered',
  stickerNotPicked: 'Hindi napili · Not picked',
  stickerMissed: 'Hindi natuloy · Missed',
  maps: 'Buksan sa Google Maps · Open in Google Maps',
  route: 'Ruta, sa salita · Route, in words',
  routeLine: (donor: string, donorStreet: string, pantry: string, pantryStreet: string) =>
    `Kunin kay ${donor}, ${donorStreet}. Ihatid kay ${pantry}, ${pantryStreet}. · Pick up at ${donor}, ${donorStreet}. Drop off at ${pantry}, ${pantryStreet}.`,
  lot: (n: string) => `Lot ${n}`,
} as const;

/** Splits "Filipino · English" into its two lines. The first " · " divides them. */
export function splitBi(s: string): { fil: string; en: string } {
  const i = s.indexOf(' · ');
  return i < 0 ? { fil: s, en: '' } : { fil: s.slice(0, i), en: s.slice(i + 3) };
}
