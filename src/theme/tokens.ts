/**
 * Salo's palengke price-board world (mockup/salo-mockup.html), as Material-style roles.
 * Kraft tags stay kraft in both themes: they are physical objects under the stall light.
 */
export interface Palette {
  ground: string;
  groundRaised: string;
  text: string;
  textMuted: string;
  tarp: string;
  /** Tarp as ink on the ground or raised ground (role-state labels, CLOSE, back link, radio ring). Lighter at night. */
  tarpInk: string;
  /** tarp-night in both themes: the post FAB's shadow colour. */
  tarpNight: string;
  /** Fill of a selected chip or tab. Tarp in light; tarp ink at night (tarp-night is 1.3:1 on the night canopy). */
  selectFill: string;
  /** Text on a selected fill: white on tarp in light; the night ground on the lighter tarp ink at night. */
  onSelect: string;
  onTarp: string;
  kraft: string;
  kraftEdge: string;
  onKraft: string;
  onKraftMuted: string;
  /** Marker red on kraft: withdrawn, failed, not delivered. Same in both themes (the tag is the same tag). */
  onKraftAlert: string;
  /** The receipt tape the dashboard prints on: off-white paper, ink on top. */
  tape: string;
  onTape: string;
  marker: string;
  red: string;
  lime: string;
  onLime: string;
  zinc: string;
  rule: string;
  focus: string;
  scrim: string;
}

export const LIGHT: Palette = {
  ground: '#e6ecf6',
  groundRaised: '#f3f6fb',
  text: '#161616',
  textMuted: '#3a4a66',
  tarp: '#1947b8',
  tarpInk: '#1947b8',
  tarpNight: '#0f2f7a',
  selectFill: '#1947b8',
  onSelect: '#ffffff',
  onTarp: '#ffffff',
  kraft: '#d6ae7b',
  kraftEdge: '#b68e5c',
  onKraft: '#161616',
  onKraftMuted: '#4a3520',
  onKraftAlert: '#8f110b',
  tape: '#fbf8f0',
  onTape: '#161616',
  marker: '#161616',
  red: '#a8150f',
  lime: '#d6ff3d',
  onLime: '#161616',
  zinc: '#8c99a8',
  rule: '#c3cddc',
  focus: '#0f2f7a',
  scrim: 'rgba(15, 47, 122, 0.45)',
};

/** Night canopy: the stall after dark, lit by one bulb. */
export const DARK: Palette = {
  ground: '#0b1328',
  groundRaised: '#132042',
  text: '#e6ecf6',
  textMuted: '#aebbd4',
  tarp: '#0f2f7a',
  // tarp-night reads at 1.3 to 1.5:1 on the night canopy, so tarp-as-ink uses the next step of the tarp-night ramp.
  tarpInk: '#78a3f8',
  tarpNight: '#0f2f7a',
  // Selected chips and tabs: the lighter ink fill with the night ground as text (7.4:1), not the 1.3:1 night tarp.
  selectFill: '#78a3f8',
  onSelect: '#0b1328',
  onTarp: '#ffffff',
  kraft: '#d6ae7b',
  kraftEdge: '#9c764a',
  onKraft: '#161616',
  onKraftMuted: '#4a3520',
  onKraftAlert: '#8f110b',
  tape: '#ece5d2',
  onTape: '#141414',
  marker: '#161616',
  red: '#ff7a6b',
  lime: '#d6ff3d',
  onLime: '#161616',
  zinc: '#7f8ca3',
  rule: '#2a3a63',
  focus: '#d6ff3d',
  scrim: 'rgba(0, 0, 0, 0.6)',
};

/** Font family names as registered by useFonts in src/app/_layout.tsx. */
export const FONT = {
  marker: 'PermanentMarker_400Regular',
  body: 'Archivo_400Regular',
  bodyStrong: 'Archivo_600SemiBold',
  title: 'Archivo_700Bold',
  label: 'ArchivoNarrow_600SemiBold',
  labelRegular: 'ArchivoNarrow_500Medium',
} as const;

/** Type roles (sp). Sizes scale with the system font setting; never hand-pick sizes per screen. */
export const TYPE = {
  wordmark: { fontFamily: FONT.marker, fontSize: 26, lineHeight: 32 },
  item: { fontFamily: FONT.marker, fontSize: 24, lineHeight: 30 },
  title: { fontFamily: FONT.title, fontSize: 20, lineHeight: 26 },
  body: { fontFamily: FONT.body, fontSize: 16, lineHeight: 22 },
  bodyStrong: { fontFamily: FONT.bodyStrong, fontSize: 16, lineHeight: 22 },
  label: { fontFamily: FONT.label, fontSize: 13, lineHeight: 16, letterSpacing: 0.4 },
  small: { fontFamily: FONT.labelRegular, fontSize: 13, lineHeight: 17 },
  sticker: { fontFamily: FONT.marker, fontSize: 15, lineHeight: 18 },
  /** Receipt tape: message type in Archivo Narrow caps, then the sentence in Archivo. */
  tapeType: { fontFamily: FONT.label, fontSize: 15, lineHeight: 20, letterSpacing: 0.6 },
  tapeBody: { fontFamily: FONT.body, fontSize: 16, lineHeight: 22 },
  /** Lot name on a kraft chip (the strip and the tape header). */
  chipItem: { fontFamily: FONT.marker, fontSize: 20, lineHeight: 24 },
} as const;

export const SPACE = { xs: 4, s: 8, m: 12, l: 16, xl: 24, xxl: 32 } as const;
