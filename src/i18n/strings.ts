import type { AwardState } from '../engine/types';

/**
 * All user-facing copy. Donor, pantry and driver screens are Filipino-first with a small English
 * subtitle (PRODUCT.md). Written by Claude; Codex reviews the Filipino before the demo (decision log).
 */

/** English count line: "1 lot", "2 lots". The Filipino word "lot" never changes. */
export const lotCountEn = (n: number): string => (n === 1 ? '1 lot' : `${n} lots`);

export const S = {
  appName: 'Salo',
  simulated: { fil: 'Simulasyon', en: 'Simulated data' },
  tonight: { fil: 'Ngayong gabi', en: 'Tonight' },
  post: { fil: 'I-post ang tira', en: 'Post surplus' },
  emptyTonight: {
    fil: 'Wala ka pang nai-post ngayong gabi.',
    en: 'Nothing posted yet tonight.',
    hint: 'Pindutin ang “I-post ang tira” at isulat kung ano ang natira, gaya ng pag-text.',
  },
  /** The donor post screen. The Filipino lines are the donor's; `en` lines are the English subtitles. */
  postScreen: {
    question: 'Ano ang natira?',
    example: 'Isulat gaya ng pag-text. Halimbawa: “May 3 tray ng adobo pa, kunin bago mag-8 PM.”',
    placeholder: 'May 3 tray ng adobo pa, kunin bago mag-8',
    back: 'Bumalik · Back',
  },
  /**
   * The text-to-cards path (M4). Filipino first. Nothing here posts: the donor confirms every card with postForm.post.
   */
  parsePost: {
    send: 'Basahin · Read',
    sending: 'Binabasa ang mensahe… · Reading your message…',
    fallbackBanner: 'Offline na binasa ang mensahe. Pakisuri ang bawat item. · Read offline. Please check each item.',
    noItems: 'Walang nakitang item sa mensahe. Pumili sa listahan sa ibaba. · No items found in the message. Pick from the list below.',
    unmatched: 'Hindi namin matukoy ang item. Pumili ng isa, o alisin ito. · We could not tell the item. Choose one, or remove it.',
    noMatch: 'Walang katugmang item. Pumili sa listahan sa ibaba, o alisin ito. · No matching item. Pick one from the list below, or remove it.',
    missingUnit: 'Walang nabanggit na unit. Pumili ng item at unit. · No unit mentioned. Choose the item and unit.',
    missingQuantity: 'Walang nabanggit na dami. Piliin ang dami gamit ang + at − bago i-post. · No amount mentioned. Set it with + and − before posting.',
    overMax: (max: number) => `Lagpas ito sa pinakamataas na dami (${max}). Bawasan gamit ang −. · Over the maximum amount (${max}). Lower it with −.`,
    pickupAsk: 'Hindi malinaw ang oras ng pagkuha. Pumili ng oras. · The pickup time is unclear. Pick a time.',
    fixFirst: 'Ayusin muna ang mga card sa itaas. · Fix the cards above first.',
    chooseA11y: (fil: string, en: string) => `Piliin ang ${fil}. Choose ${en}.`,
  },
  /**
   * The manual post form under the text box (M3). Filipino first; English after " · " or " / ". The one word
   * "expiry" appears only inside the negated pickup note; the test in src/donor/__tests__ checks that.
   */
  postForm: {
    heading: 'O pumili rito · Or pick here',
    hint: 'Pumili ng hanggang 5 item, ilagay ang dami, at piliin ang oras ng pagkuha. / Pick up to 5 items, set the amounts, and choose a pickup time.',
    fromBefore: 'Galing sa mga na-post mo dati · From your earlier posts',
    others: 'Iba pa · Others',
    addA11y: (fil: string, en: string) => `Idagdag ang ${fil}. Add ${en}.`,
    full: 'Hanggang 5 item lang sa isang post. / Up to 5 items per post.',
    noItems: 'Wala pang napiling item. / No items picked yet.',
    amount: 'Dami · Amount',
    decreaseA11y: (fil: string, en: string) => `Bawasan ang dami ng ${fil}. Decrease the amount of ${en}.`,
    increaseA11y: (fil: string, en: string) => `Dagdagan ang dami ng ${fil}. Increase the amount of ${en}.`,
    amountSaid: (qty: number, unitFil: string, unitEn: string) => `Dami: ${qty} ${unitFil}. Amount: ${qty} ${unitEn}.`,
    kg: (kg: number) => `Mga ${kg} kg · about ${kg} kg`,
    storage: 'Imbakan · Storage',
    fridge: 'Kailangan ng ref kung itatabi · if kept',
    noFridge: 'Walang ref · no fridge needed',
    removeA11y: (fil: string, en: string) => `Alisin ang ${fil}. Remove ${en}.`,
    pickupLabel: 'Oras ng pagkuha · Pickup time',
    pickupChip: (time: string) => `Kunin bago ${time}`,
    pickupNote: 'Oras ito ng pagkuha, hindi expiry. / This is a pickup time, not an expiry date.',
    pickupClosed: 'Sarado na ang pagkuha ngayong gabi. / Pickups are closed for tonight.',
    /** Names the ids the posts will get: one lot, or two or more lots (callers pass at least one id). */
    becomes: (ids: readonly string[]) => {
      if (ids.length === 1) return `Ito ang magiging lot ID: ${ids[0]}. / This will be lot ${ids[0]}.`;
      const last = ids[ids.length - 1];
      const head = ids.slice(0, -1);
      return `Ito ang mga magiging lot ID: ${head.join(', ')} at ${last}. / These will be lots ${head.join(', ')} and ${last}.`;
    },
    post: 'Tama, i-post · Correct, post it',
    pickFirst: 'Pumili muna ng item. / Pick an item first.',
    problems: 'Hindi pa ma-post ngayon. Tingnan ang oras ng pagkuha at subukan ulit. / Not able to post yet. Check the pickup time and try again.',
  },
  /** TalkBack hint on a donor tag. */
  openLot: 'Buksan ang detalye ng lot',
  /** The TalkBack label of the simulated clock on the tarp (the dashboard uses `dash.clockA11y`). */
  clockA11y: (clock: string) => `Oras sa simulasyon ${clock}. Simulated time ${clock}.`,
  /** The sentences a tag reads aloud, by state. The state word is in the sentence where it matters. */
  tagWho: {
    bids: (n: number) => `${n} pantry ang nag-bid.`,
    tentative: (pantry: string) => `Para sa ${pantry} muna ang pagkain hanggang may driver na mag-confirm.`,
    final: (pantry: string, driver: string, eta: string) => `Para sa ${pantry} ang pagkain. Si ${driver} ang maghahatid; darating bandang ${eta}.`,
    delivered: (pantry: string, driver: string) => `Naihatid sa ${pantry} ni ${driver}.`,
  },
  /** Donor-screen simulation control labels (the dashboard uses `dash` instead). */
  simDonor: {
    finished: 'Tapos na ang simulasyon.',
    pause: 'I-pause ang simulasyon.',
    play: 'Ituloy ang simulasyon. Play the simulation.',
  },
  slots: {
    dami: { fil: 'Dami', en: 'Amount' },
    kunin: { fil: 'Kunin bago', en: 'Pick up by' },
    ref: { fil: 'Kailangan ng ref kung itatabi', en: 'Needs a fridge if kept' },
    noRef: { fil: 'Hindi kailangan ng ref', en: 'No fridge needed' },
  },
  states: {
    announced: { fil: 'Nai-post', en: 'Posted', sticker: 'NAI-POST' },
    bids: { fil: 'May bid', en: 'Bids in', sticker: 'MAY BID' },
    tentative: { fil: 'Tentative', en: 'Tentative', sticker: 'TENTATIVE' },
    final: { fil: 'May driver na', en: 'Driver committed', sticker: 'FINAL' },
    delivered: { fil: 'Naihatid', en: 'Delivered', sticker: 'NAIHATID' },
    stranded: { fil: 'Hindi naihatid', en: 'Not delivered', sticker: 'DI NAIHATID' },
    unawarded: { fil: 'Walang pantry ang tumanggap', en: 'No pantry accepted it', sticker: 'WALANG TUMANGGAP' },
  },
  journey: ['Nai-post', 'May bid', 'Tentative', 'May driver', 'Naihatid'] as const,
  heldUntilDriver: { fil: 'Hawak muna hanggang may driver na mag-confirm.', en: 'Held until a driver commits.' },
  units: { tray: 'tray', piece: 'piraso', bilao: 'bilao', kg: 'kg', loaf: 'tinapay', pot: 'kaldero', pack: 'pakete', can: 'lata' },
} as const;

/**
 * Live dashboard copy. English only (decision: the dashboard and results are in English), and written for the
 * faculty panel: plain words, the reason spelled out, no codes the panel has to decode.
 */
export const dash = {
  simulated: 'SIMULATED',
  simulatedA11y: 'Simulated data',
  clockA11y: (clock: string) => `Simulated time ${clock}`,
  policyLine: (name: string) => `Policy: ${name}`,
  play: 'Play simulation',
  pause: 'Pause simulation',
  finished: 'Simulation finished',
  speed: 'Speed',
  speedA11y: (x: string, secs: number) => `${x} speed, ${secs} seconds per simulated minute`,
  noLotYet: 'No lot posted yet. Press play to start the evening.',
  noLotSelected: 'Pick a lot below to read its trace.',
  tapeEmpty: 'Nothing printed for this lot yet.',
  chipA11y: (item: string, state: string, id: string) => `${item}, ${state}. Lot ${id}.`,
  stateSticker: {
    announced: 'POSTED',
    bids: 'BIDS IN',
    tentative: 'TENTATIVE',
    final: 'FINAL',
    delivered: 'DELIVERED',
    stranded: 'NO DRIVER',
    unawarded: 'NO PANTRY',
  } as const,
  stateWords: {
    announced: 'posted',
    bids: 'bids in',
    tentative: 'tentative, held until a driver commits',
    final: 'driver committed',
    delivered: 'delivered',
    stranded: 'not delivered',
    unawarded: 'no pantry took it',
  } as const,
  cancelDriver: 'Cancel driver',
  cancelHint: 'Works only while this lot is FINAL at the clock.',
  cancelDisabledHint: 'Enabled when this lot is FINAL at the clock.',
  cancelledStatus: (clock: string) => `Driver cancelled at ${clock}. The delivery is re-announced.`,
  cancelRefused: 'That lot has no driver to cancel right now.',
  replay: 'Replay with baseline',
  sheetTitle: 'Replay with baseline',
  sheetBody: 'Same lots, same clock. Only the allocation rule changes.',
  close: 'Close',
  policies: {
    salo: { name: 'Salo', how: 'Pantries bid shares from a budget. The highest bid wins.' },
    fcfs: { name: 'First come first served', how: 'The first pantry to reply gets the lot.' },
    nearest: { name: 'Nearest pantry', how: 'The pantry closest by road gets the lot.' },
    central_greedy: { name: 'Central greedy', how: 'Highest value minus a travel-time penalty.' },
  } as const,
  // Tape lines
  to: 'to',
  toPantries: 'to pantries',
  toDrivers: 'to drivers',
  eta: 'ETA',
  onTime: 'on time',
  minutesLate: (n: number) => `${n} min late`,
  pantryBid: (shares: string, value: number) => `${shares} shares · value ${value}%`,
  valueOnly: (value: number) => `value ${value}%`,
  /** Shown under the tarp band for every replay under a baseline. One sentence: TalkBack reads it whole. */
  replayNote:
    'One simulated tuning evening (E05), untuned settings — an illustration, not a result; results come only from the main evenings (Results screen)',
  rulerA11y: 'Evening ruler, 17:00 to 21:30',
  rulerHint: 'Tap or drag to move the clock and pause. Swipe up or down to move 5 minutes.',
  driverBid: (eta: string, reliability: number) => `ETA ${eta} · reliability ${reliability}%`,
  tentativeDetail: (shares: string) => `${shares} shares, award held`,
  /** A baseline's TENTATIVE line: no share budget, so no shares. */
  awardHeld: 'award held',
  refuse: {
    closed_before_earliest_arrival: 'closed before the earliest driver could arrive',
    cannot_store_lot: "can't store it, too big for dry and fridge space",
    no_remaining_need: 'no remaining need today',
    no_shares_left: 'no shares left tonight',
  } as const,
  failure: {
    withdrew_before_commit: 'driver withdrew before committing',
    no_show: 'driver did not show up at pickup',
    cancelled_by_operator: 'driver cancelled by the operator',
    no_commit_before_pickup_deadline: 'no driver committed before the pickup deadline',
    no_reply: 'driver did not commit in time',
  } as const,
  // Bars
  barOpen: (n: number) => `TENTATIVE · held until a driver commits · ${n} min`,
  barCommitted: (n: number) => `held ${n} min · driver committed`,
  barStruck: (n: number) => `held ${n} min · driver failed`,
  // Views under the ruler
  viewsLabel: 'Dashboard view',
  views: { tape: 'Tape', bids: 'Bids', map: 'Map', drivers: 'Drivers' } as const,
  viewA11y: (name: string) => `Show ${name}`,
  // Bid list (DSH-03)
  bidsTitle: 'Bids for this lot, largest first',
  bidsBaseline: 'Baselines have no share budget. Bids are listed in the order they came, with values only.',
  bidsEmpty: 'No pantry has bid on this lot yet.',
  refusedTag: 'REFUSED',
  hasFridge: 'Has a fridge',
  noFridge: 'No fridge',
  km: (n: number) => `${n.toFixed(1)} km`,
  valuesAt: (v: string) => `Values it at ${v}`,
  sharesCount: (n: string) => `${n} shares`,
  wasShares: (n: string) => `was ${n} shares`,
  remarkAt: (clock: string, by: string, own: string) => `Re-marked at ${clock} when ${by} outbid ${own}`,
  // Schematic map and table (DSH-06)
  mapTitle: 'Tonight on the map',
  schematic: 'Schematic, not to scale',
  mapSwitch: { map: 'Map', table: 'Table' } as const,
  mapA11y: 'Schematic map of tonight, not to scale. The table shows the same places in words.',
  legend: { donor: 'Donor with surplus', pantry: 'Pantry', driver: 'Volunteer driver', tentative: 'Tentative route' } as const,
  legendNote:
    'Dashed route: tentative. Solid route: final. No roads are drawn, because the roads file is not bundled: each route is a straight line from donor to pantry.',
  tableHead: { name: 'Name', role: 'Role', where: 'Where', rightNow: 'Right now', from: 'From' } as const,
  role: { donor: 'Donor', pantry: 'Pantry', driver: 'Volunteer driver' } as const,
  noPlaces: 'No places yet. They appear as lots post and the agents answer.',
  rowA11y: (name: string, role: string, where: string, rightNow: string, from: string) =>
    `${name}. ${role}. ${where}. Right now: ${rightNow}.${from ? ` From ${from}.` : ''}`,
  holdingLot: (lot: string, state?: AwardState) => `holding ${lot}, ${state ? dash.stateWords[state] : 'posted'}`,
  bidOn: (lot: string) => `bid on ${lot}`,
  refusedLot: (lot: string) => `refused ${lot}`,
  committedTo: (lot: string) => `committed to ${lot}`,
  offeredFor: (lot: string) => `offered for ${lot}`,
  failedOn: (lot: string) => `failed on ${lot}`,
  deliveredLot: (lot: string) => `delivered ${lot}`,
  lotState: (lot: string, state?: AwardState) => `${lot} ${state ? dash.stateWords[state] : 'posted'}`,
  noRoute: 'No award yet, so no route.',
  // Driver track record (DSH-07)
  driversTitle: 'Driver track record',
  driversNote: 'These are the frozen starting estimates from tuning. The update after each run is shown after the evening.',
  track: (shows: number, runs: number, est: string) => `Showed up ${shows} of ${runs} runs (estimate ${est})`,
  newVolunteer: (est: string) => `New volunteer, no history yet (estimate ${est})`,
  driversEmpty: 'No driver has been asked yet.',
} as const;

/**
 * The picker, the first screen (CC-01): who you are tonight, and the writes that were not sent yet. Filipino first, then
 * English after " · " (the same convention as the other copy).
 */
export const PICKER = {
  title: 'Sino ka ngayong gabi?',
  subtitle: 'Who are you tonight? Lahat ng pangalan ay kathang-isip.',
  stranded: {
    count: (n: number) => `${n} na hindi pa naipapadala · ${n} not sent yet`,
    keptHere:
      'Nakatago ang mga ito at ipapadala kapag napili ulit ang tungkulin nila · Kept here; they are sent when you choose that role again.',
    discard: 'Burahin ang mga ito · Discard them',
    discardA11y: 'Burahin ang mga hindi pa naipapadala. Discard the writes not sent yet.',
  },
  roles: {
    donor: { fil: 'Donor', en: 'Food business with surplus' },
    pantry: { fil: 'Pantry', en: 'Community pantry coordinator' },
    driver: { fil: 'Driver', en: 'Volunteer driver', who: 'Pipiliin sa susunod na screen' },
    dashboard: { fil: 'Dashboard', en: 'Live view for the panel', who: 'Walang profile na kailangan' },
  },
  /** TalkBack label of a role row. The not-ready sentence is kept for a role that is not built yet. */
  roleA11y: (fil: string, en: string, who: string, ready: boolean) =>
    `${fil}, ${en}. ${who}.${ready ? '' : ' Darating sa susunod na build.'}`,
  state: { open: 'PUMASOK', later: 'SA SUSUNOD' },
} as const;
