/**
 * Driver screen copy (mobile-feature, DRV-01 to DRV-06). Filipino first, English after " · ".
 * Each string is shown as the Filipino line with the English line beneath it (CC-05). Times come in as "h:mm AM/PM".
 * Reviewed by Codex after any Taglish change (docs/handoffs/2026-10-26-mobile-feature-driver.md has every string).
 */
export const DRV = {
  title: 'Tagahatid · Volunteer driver',
  simNote: 'Gawa-gawa lang para sa simulasyon ang lahat ng tagahatid, lugar, at numero rito · Every driver, place and number here is fictional or simulated',
  chooserLabel: 'Sino ka sa simulasyon? · Who are you in the simulation?',
  chooserHint: 'Pumili ng tagahatid na tatanggap ng mga request. Ikaw ang gaganap bilang napili mo · Choose a driver who gets requests. You hold the one you choose',
  chooserLocked: 'Hindi na mapapalitan ang tagahatid ngayong gabi. I-pause at i-rewind sa 5:00 PM para mapalitan · You cannot change the driver tonight. Pause and rewind to 5:00 PM to change it',
  chooserItem: (name: string) => `Piliin si ${name} · Choose ${name}`,
  requests: 'Mga request · Requests',
  requestsEmpty: 'Wala pang request sa ngayon · No requests right now',
  requestsEmptyHint: 'Lalabas dito ang mga request habang umuusad ang oras sa simulasyon · A request appears here when the simulated clock calls you',
  pickupFrom: 'Kunin sa · Pick up at',
  dropoffAt: 'Ihatid sa · Drop off at',
  before: (t: string) => `bago ang ${t} · before ${t}`,
  window: (n: number) => `Sumagot sa loob ng ${n} min · Reply within ${n} min`,
  offer: 'Mag-alok · Offer to deliver',
  offerNo: 'Hindi ka aabot bago ang oras · You cannot arrive before the deadline',
  decline: 'Tanggihan · Decline',
  offered: (t: string) => `Nag-alok ka bago ang ${t} · Offered, by ${t}`,
  picked: (n: number) => `Napili ka! Kumpirmahin ang paghatid sa loob ng ${n} min · You were picked, commit within ${n} min`,
  commit: 'Kumpirmahin ang paghatid · Commit',
  withdraw: 'Bawiin · Withdraw',
  withdrawWarn: 'Mabibilang itong takbong hindi natuloy · Counts as a missed run',
  notPicked: 'Hindi napili · Not picked',
  notPickedHint: 'May ibang tagahatid na napili para sa lot na ito · Another driver won this lot',
  committed: (t: string) => `Nakumpirma na; maghahatid bago ang ${t} · Committed, delivers before the ${t} pickup deadline`,
  runs: 'Mga takbo ko · My runs',
  runsEmpty: 'Wala ka pang takbo · No runs yet',
  pickedUp: (t: string) => `Nakuha noong ${t} · Picked up at ${t}`,
  delivered: (t: string) => `Naihatid noong ${t} · Delivered at ${t}`,
  onTime: 'Sa oras · On time',
  late: 'Lampas sa oras · Late',
  notYet: 'Hindi pa naihahatid · Not delivered yet',
  withdrewStatus: 'Binawi mo · You withdrew',
  noReplyStatus: 'Hindi nakapag-commit sa oras · No commit in time',
  cancelledStatus: 'Kinansela ng operator · Cancelled by the operator',
  missedNote: 'Mabibilang itong biyahe na hindi natuloy · Counts as a missed run',
  stickerRequest: 'Request · Request',
  stickerPicked: 'Napili · Picked',
  stickerCommitted: 'Naka-commit · Committed',
  stickerDelivered: 'Naihatid · Delivered',
  stickerNotPicked: 'Hindi napili · Not picked',
  stickerMissed: 'Hindi natuloy · Missed',
  maps: 'Buksan sa Google Maps · Open in Google Maps',
  route: 'Detalye ng ruta · Route, in words',
  routeLine: (donor: string, donorStreet: string, pantry: string, pantryStreet: string) =>
    `Kunin sa ${donor}, ${donorStreet}. Ihatid sa ${pantry}, ${pantryStreet}. · Pick up at ${donor}, ${donorStreet}. Drop off at ${pantry}, ${pantryStreet}.`,
  lot: (n: string) => `Lot ${n}`,
} as const;

/** Splits "Filipino · English" into its two lines. The first " · " divides them. */
export function splitBi(s: string): { fil: string; en: string } {
  const i = s.indexOf(' · ');
  return i < 0 ? { fil: s, en: '' } : { fil: s.slice(0, i), en: s.slice(i + 3) };
}
