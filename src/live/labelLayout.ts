/**
 * Label collision pass for the schematic map (DSH-06). Pure: the same points give the same placements every time.
 *
 * Each label is a short text beside its marker. Labels are placed greedily in priority order (lower number first, ties
 * by input order). Each label tries four positions in turn: right, left, above, below. The first position that touches no
 * placed label, no marker, and stays inside the map is used. A label that fits none is hidden (placement null); the
 * places table still lists it, so nothing depends on the map.
 *
 * Geometry is in the map's own pixels. A label's box is its advance width (characters x fontSize x charWidth) by the
 * text's ascent and descent. Markers are squares of half-size markerHalf around the point.
 */

export interface LabelItem {
  key: string;
  text: string;
  /** The marker's centre. */
  x: number;
  y: number;
  /** Lower places first. Equal priorities keep the input order. */
  priority: number;
}

export type Placement = 'right' | 'left' | 'above' | 'below';

export interface PlacedLabel {
  key: string;
  /** Text anchor: the start of the baseline (SVG x, y with textAnchor start). */
  x: number;
  y: number;
  /** Null means the label is hidden. */
  placement: Placement | null;
}

export interface LabelLayoutOptions {
  /** Font size in px. Default 12. */
  fontSize?: number;
  /** Average glyph advance as a fraction of the font size. Default 0.6. */
  charWidth?: number;
  /** Half the marker's side. Default 8. */
  markerHalf?: number;
  /** Gap between a marker's centre and a side label's text. Default 10. */
  offset?: number;
  /** Map size. When both are given, a label must lie inside [0, width] x [0, height]. */
  width?: number;
  height?: number;
}

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const ORDER: readonly Placement[] = ['right', 'left', 'above', 'below'];

export function layoutLabels(items: readonly LabelItem[], options: LabelLayoutOptions = {}): PlacedLabel[] {
  const fontSize = options.fontSize ?? 12;
  const charWidth = options.charWidth ?? 0.6;
  const markerHalf = options.markerHalf ?? 8;
  const offset = options.offset ?? 10;
  const ascent = fontSize * 0.8;
  const descent = fontSize * 0.2;
  const sideBaseline = fontSize / 3;

  const markers: Box[] = items.map((it) => ({ left: it.x - markerHalf, top: it.y - markerHalf, right: it.x + markerHalf, bottom: it.y + markerHalf }));
  const placed: Box[] = [];
  const out: PlacedLabel[] = items.map((it) => ({ key: it.key, x: it.x, y: it.y, placement: null }));

  const order = items.map((_, i) => i).sort((a, b) => items[a].priority - items[b].priority || a - b);
  for (const i of order) {
    const it = items[i];
    const w = it.text.length * fontSize * charWidth;
    for (const p of ORDER) {
      const anchor = anchorFor(p, it.x, it.y, w, { offset, markerHalf, sideBaseline });
      const box: Box = { left: anchor.x, top: anchor.y - ascent, right: anchor.x + w, bottom: anchor.y + descent };
      if (fits(box, placed, markers, options)) {
        placed.push(box);
        out[i] = { key: it.key, x: anchor.x, y: anchor.y, placement: p };
        break;
      }
    }
  }
  return out;
}

function anchorFor(
  p: Placement,
  mx: number,
  my: number,
  w: number,
  g: { offset: number; markerHalf: number; sideBaseline: number },
): { x: number; y: number } {
  switch (p) {
    case 'right':
      return { x: mx + g.offset, y: my + g.sideBaseline };
    case 'left':
      return { x: mx - g.offset - w, y: my + g.sideBaseline };
    case 'above':
      return { x: mx - w / 2, y: my - g.markerHalf - 6 };
    case 'below':
      return { x: mx - w / 2, y: my + g.markerHalf + 12 };
  }
}

/** Strict overlap: two boxes that only share an edge do not collide. */
function overlaps(a: Box, b: Box): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function fits(box: Box, placed: readonly Box[], markers: readonly Box[], options: LabelLayoutOptions): boolean {
  if (options.width !== undefined && options.height !== undefined) {
    if (box.left < 0 || box.top < 0 || box.right > options.width || box.bottom > options.height) return false;
  }
  if (placed.some((b) => overlaps(b, box))) return false;
  return !markers.some((m) => overlaps(m, box));
}
