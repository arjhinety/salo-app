import { contrastRatio, relativeLuminance, requiredContrast } from '../contrast';
import { DARK, LIGHT, TYPE, type Palette } from '../tokens';

type Role = keyof typeof TYPE;
/** Bold is weight 700 or more. Among the roles only the title is 700. */
const isBold = (role: Role) => role === 'title';

interface Pair {
  name: string;
  fg: keyof Palette;
  bg: keyof Palette;
  role: Role;
}

/** The key pairs the design names, plus every other text-on-surface pair the screens draw (see the handoff table). */
const PAIRS: readonly Pair[] = [
  // Key pairs.
  { name: 'ink on paper', fg: 'onTape', bg: 'tape', role: 'tapeBody' },
  { name: 'alert red on paper', fg: 'onKraftAlert', bg: 'tape', role: 'tapeType' },
  { name: 'tarp ink on ground', fg: 'tarpInk', bg: 'ground', role: 'bodyStrong' },
  { name: 'tarp ink on raised ground', fg: 'tarpInk', bg: 'groundRaised', role: 'label' },
  { name: 'lime sticker ink', fg: 'onLime', bg: 'lime', role: 'sticker' },
  { name: 'kraft tag ink', fg: 'onKraft', bg: 'kraft', role: 'item' },
  { name: 'kraft tag pencil', fg: 'onKraftMuted', bg: 'kraft', role: 'small' },
  { name: 'kraft tag slot label', fg: 'onKraftMuted', bg: 'kraft', role: 'label' },
  // Surfaces that carry text and are not named above.
  { name: 'problem sticker on kraft', fg: 'onKraftAlert', bg: 'kraft', role: 'sticker' },
  { name: 'marker name on kraft', fg: 'marker', bg: 'kraft', role: 'item' },
  { name: 'ink on ground', fg: 'text', bg: 'ground', role: 'bodyStrong' },
  { name: 'muted ink on ground', fg: 'textMuted', bg: 'ground', role: 'small' },
  { name: 'ink on raised ground', fg: 'text', bg: 'groundRaised', role: 'body' },
  { name: 'muted ink on raised ground', fg: 'textMuted', bg: 'groundRaised', role: 'small' },
  { name: 'alert red on ground', fg: 'red', bg: 'ground', role: 'small' },
  { name: 'alert red on raised ground', fg: 'red', bg: 'groundRaised', role: 'small' },
  { name: 'map legend ink on ground', fg: 'text', bg: 'ground', role: 'small' },
  { name: 'map caption on paper', fg: 'onTape', bg: 'tape', role: 'small' },
  { name: 'white on tarp canopy (wordmark)', fg: 'onTarp', bg: 'tarp', role: 'wordmark' },
  { name: 'white on tarp canopy (title)', fg: 'onTarp', bg: 'tarp', role: 'title' },
  { name: 'white on tarp canopy (small)', fg: 'onTarp', bg: 'tarp', role: 'small' },
  { name: 'white on tarp fill (button)', fg: 'onTarp', bg: 'tarp', role: 'bodyStrong' },
  { name: 'disabled label on rule (exempt, kept above AA)', fg: 'textMuted', bg: 'rule', role: 'bodyStrong' },
  // Selected states: driver chips, dashboard views and donor post chips (fill with the chip's label on it).
  { name: 'selected chip label (bodyStrong)', fg: 'onSelect', bg: 'selectFill', role: 'bodyStrong' },
  { name: 'selected driver chip label (label)', fg: 'onSelect', bg: 'selectFill', role: 'label' },
  { name: 'selected dashboard view label', fg: 'onSelect', bg: 'selectFill', role: 'bodyStrong' },
  // Run the main evenings: the filled primary button (tarp fill, white label), and its progress run.
  { name: 'run button label on tarp fill', fg: 'onTarp', bg: 'tarp', role: 'bodyStrong' },
  { name: 'run button cancel label on ground', fg: 'text', bg: 'ground', role: 'bodyStrong' },
  { name: 'run failed or cancelled line (red on ground)', fg: 'red', bg: 'ground', role: 'body' },
];

/**
 * Non-text pairs (WCAG 1.4.11): a selected state, the run button's edge and the run's progress fill must stand out
 * from the ground they sit on, at 3:1 or more, in both themes.
 */
const NON_TEXT: readonly { name: string; fg: keyof Palette; bg: keyof Palette }[] = [
  { name: 'selected fill against the ground', fg: 'selectFill', bg: 'ground' },
  { name: 'selected fill against raised ground', fg: 'selectFill', bg: 'groundRaised' },
  { name: 'run button edge (tarp ink) on the ground', fg: 'tarpInk', bg: 'ground' },
  { name: 'run progress fill (tarp ink) on the ground', fg: 'tarpInk', bg: 'ground' },
];

const THEMES: readonly [string, Palette][] = [
  ['light', LIGHT],
  ['dark', DARK],
];

describe('WCAG contrast helper', () => {
  it('gives 21:1 for black on white and 1:1 for a colour on itself', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5);
  });

  it('matches the published value for #767676 on white (4.54:1)', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 1);
  });

  it('is symmetric in its two colours', () => {
    expect(contrastRatio('#8f110b', '#ece5d2')).toBeCloseTo(contrastRatio('#ece5d2', '#8f110b'), 10);
  });

  it('rejects anything that is not #rrggbb', () => {
    expect(() => relativeLuminance('rgba(0, 0, 0, 0.5)')).toThrow();
    expect(() => relativeLuminance('#fff')).toThrow();
  });

  it('asks for 3:1 at 24 px, or 18.66 px bold, and 4.5:1 for everything else', () => {
    expect(requiredContrast(24, false)).toBe(3);
    expect(requiredContrast(20, true)).toBe(3);
    expect(requiredContrast(18.66, true)).toBe(3);
    expect(requiredContrast(20, false)).toBe(4.5);
    expect(requiredContrast(16, true)).toBe(4.5);
    expect(requiredContrast(13, false)).toBe(4.5);
  });
});

describe('theme text pairs meet WCAG AA', () => {
  for (const [theme, palette] of THEMES) {
    it.each(PAIRS.map((p) => [p.name, p] as const))(`${theme}: %s`, (_name, p) => {
      const ratio = contrastRatio(palette[p.fg], palette[p.bg]);
      const need = requiredContrast(TYPE[p.role].fontSize, isBold(p.role));
      expect(ratio).toBeGreaterThanOrEqual(need);
    });
  }
});

describe('selected states and the run button meet WCAG AA (non-text 3:1)', () => {
  for (const [theme, palette] of THEMES) {
    it.each(NON_TEXT.map((p) => [p.name, p] as const))(`${theme}: %s`, (_name, p) => {
      expect(contrastRatio(palette[p.fg], palette[p.bg])).toBeGreaterThanOrEqual(3);
    });
  }

  it('the night selected fill is the ink step, not the night tarp (which is 1.3:1 on the canopy)', () => {
    expect(DARK.selectFill).toBe(DARK.tarpInk);
    expect(contrastRatio(DARK.tarp, DARK.ground)).toBeLessThan(3);
    expect(contrastRatio(DARK.selectFill, DARK.ground)).toBeGreaterThanOrEqual(3);
  });

  it('light selected states keep white text on tarp, as before', () => {
    expect(LIGHT.selectFill).toBe(LIGHT.tarp);
    expect(LIGHT.onSelect).toBe(LIGHT.onTarp);
  });
});

describe('why the tokens are split', () => {
  it('the night tarp fails as ink on the night canopy, so tarpInk is the lighter step', () => {
    expect(contrastRatio(DARK.tarp, DARK.ground)).toBeLessThan(3);
    expect(contrastRatio(DARK.tarpInk, DARK.ground)).toBeGreaterThanOrEqual(4.5);
  });

  it('the night alert red fails on the night paper, so paper uses the tape alert ink', () => {
    expect(contrastRatio(DARK.red, DARK.tape)).toBeLessThan(4.5);
    expect(contrastRatio(DARK.onKraftAlert, DARK.tape)).toBeGreaterThanOrEqual(4.5);
  });
});
