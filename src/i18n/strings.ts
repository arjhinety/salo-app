/**
 * All user-facing copy. Donor, pantry and driver screens are Filipino-first with a small English
 * subtitle (PRODUCT.md). Written by Claude; Codex reviews the Filipino before the demo (decision log).
 */
export const S = {
  appName: 'Salo',
  simulated: { fil: 'Simulasyon', en: 'Simulated data' },
  tonight: { fil: 'Ngayong gabi', en: 'Tonight' },
  post: { fil: 'Ipost ang tira', en: 'Post surplus' },
  emptyTonight: {
    fil: 'Wala ka pang naipost ngayong gabi.',
    en: 'Nothing posted yet tonight.',
    hint: 'Pindutin ang “Ipost ang tira” at sabihin o isulat kung ano ang natira, gaya ng pag-text.',
  },
  slots: {
    dami: { fil: 'Dami', en: 'Amount' },
    kunin: { fil: 'Kunin bago', en: 'Pick up by' },
    ref: { fil: 'Kailangan ng ref kung itatabi', en: 'Needs a fridge if kept' },
    noRef: { fil: 'Hindi kailangan ng ref', en: 'No fridge needed' },
  },
  states: {
    announced: { fil: 'Naipost', en: 'Posted', sticker: 'NAIPOST' },
    bids: { fil: 'May bid', en: 'Bids in', sticker: 'MAY BID' },
    tentative: { fil: 'Tentative', en: 'Tentative', sticker: 'TENTATIVE' },
    final: { fil: 'May driver na', en: 'Driver committed', sticker: 'FINAL' },
    delivered: { fil: 'Naihatid', en: 'Delivered', sticker: 'NAIHATID' },
    stranded: { fil: 'Hindi naihatid', en: 'Not delivered', sticker: 'WALANG DRIVER' },
    unawarded: { fil: 'Walang kumuha', en: 'No pantry took it', sticker: 'WALANG KUMUHA' },
  },
  journey: ['Naipost', 'May bid', 'Tentative', 'May driver', 'Naihatid'] as const,
  heldUntilDriver: { fil: 'Hawak muna hanggang may driver.', en: 'Held until a driver commits.' },
  units: { tray: 'tray', piece: 'piraso', bilao: 'bilao', kg: 'kg', loaf: 'tinapay', pot: 'kaldero', pack: 'pakete', can: 'lata' },
} as const;
