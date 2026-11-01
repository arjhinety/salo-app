/**
 * WCAG 2.x contrast for the theme tokens. Pure: no React Native imports, so the tests run it on the palettes directly.
 * Colours are #rrggbb strings (the palette has no alpha entries that carry text).
 */

/** WCAG relative luminance of an #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`contrast: expected #rrggbb, got ${hex}`);
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours, from 1 to 21. Order does not matter. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * The WCAG AA minimum for text of this size. Large text (24 px and up, or 18.66 px and up when bold) needs 3:1;
 * everything else needs 4.5:1. Sizes are the theme's sp values.
 */
export function requiredContrast(fontSize: number, bold: boolean): number {
  return fontSize >= 24 || (bold && fontSize >= 18.66) ? 3 : 4.5;
}
