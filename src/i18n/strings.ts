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
    example: 'Ano ang natira? Isulat gaya ng pag-text, halimbawa: “May 3 tray ng adobo pa, kunin bago mag-8 PM.”',
    placeholder: 'May 3 tray ng adobo pa, kunin bago mag-8',
    voiceSoon: 'Pag-post gamit ang boses, hindi pa available. Darating sa susunod na build.',
    voiceBody: 'Ang pag-unawa sa mensahe at boses ay darating sa susunod na build. Babasahin ito ni Salo at gagawing tag na iyong kukumpirmahin.',
    back: 'Bumalik · Back',
  },
  /** TalkBack hint on a donor tag. */
  openLot: 'Buksan ang detalye ng lot',
  /** The sentences a tag reads aloud, by state. The state word is in the sentence where it matters. */
  tagWho: {
    bids: (n: number) => `${n} pantry ang nag-bid.`,
    tentative: (pantry: string, held: string) => `Para sa ${pantry}, hawak muna ang pagkain. ${held}`,
    final: (pantry: string, driver: string, eta: string) => `Para sa ${pantry}. Si ${driver} ang driver; tinatayang darating bandang ${eta}.`,
    delivered: (pantry: string, driver: string) => `Naihatid sa ${pantry} ni ${driver}.`,
  },
  /** Donor-screen simulation control labels (the dashboard uses `dash` instead). */
  simDonor: {
    finished: 'Tapos na ang simulasyon. Simulation finished.',
    pause: 'Ihinto ang simulasyon. Pause the simulation.',
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
    unawarded: { fil: 'Walang pantry na tumanggap', en: 'No pantry took it', sticker: 'DI TINANGGAP' },
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
  refuse: {
    closed_before_earliest_arrival: 'closed before the earliest driver could arrive',
    cannot_store_lot: "can't store it, too big for dry and fridge space",
    no_remaining_need: 'no remaining need today',
  } as const,
  failure: {
    withdrew_before_commit: 'driver withdrew before committing',
    no_show: 'driver did not show up at pickup',
    cancelled_by_operator: 'driver cancelled by the operator',
    no_commit_before_pickup_deadline: 'no driver committed before the pickup deadline',
  } as const,
  // Bars
  barOpen: (n: number) => `TENTATIVE · held until a driver commits · ${n} min`,
  barCommitted: (n: number) => `held ${n} min · driver committed`,
  barStruck: (n: number) => `held ${n} min · driver failed`,
} as const;
