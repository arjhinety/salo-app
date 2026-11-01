import { layoutLabels, type LabelItem } from '../labelLayout';

// Hand-worked numbers. Font 12 px, average glyph 0.6 em, so "P01" is 3 x 12 x 0.6 = 21.6 px wide and "B" is 7.2 px.
// Marker half-size 8 px. Side labels sit 10 px out with the baseline at the marker's centre + 4.
// Above: baseline = centre - 14. Below: baseline = centre + 20. Ascent 9.6 px, descent 2.4 px.

describe('layoutLabels (DSH-06 collision pass)', () => {
  it('places four labels on one point at right, left, above, below, and hides the fifth', () => {
    const at = (key: string, priority: number, text = 'P01'): LabelItem => ({ key, text, x: 100, y: 100, priority });
    const out = layoutLabels([at('P01', 0), at('P02', 1), at('P03', 2), at('P04', 3), at('P05', 4)]);

    expect(out[0]).toMatchObject({ key: 'P01', placement: 'right' });
    expect(out[0].x).toBeCloseTo(110);
    expect(out[0].y).toBeCloseTo(104);

    expect(out[1]).toMatchObject({ key: 'P02', placement: 'left' });
    expect(out[1].x).toBeCloseTo(68.4);
    expect(out[1].y).toBeCloseTo(104);

    expect(out[2]).toMatchObject({ key: 'P03', placement: 'above' });
    expect(out[2].x).toBeCloseTo(89.2);
    expect(out[2].y).toBeCloseTo(86);

    expect(out[3]).toMatchObject({ key: 'P04', placement: 'below' });
    expect(out[3].x).toBeCloseTo(89.2);
    expect(out[3].y).toBeCloseTo(120);

    expect(out[4]).toMatchObject({ key: 'P05', placement: null });
  });

  it('keeps the input order in the output, and gives the higher priority the first choice', () => {
    const out = layoutLabels([
      { key: 'P02', text: 'P02', x: 100, y: 100, priority: 1 },
      { key: 'P01', text: 'P01', x: 100, y: 100, priority: 0 },
    ]);
    expect(out.map((l) => l.key)).toEqual(['P02', 'P01']);
    expect(out[1].placement).toBe('right');
    expect(out[0].placement).toBe('left');
  });

  it('moves a label off the map edge to the left', () => {
    // Right would end at 105 + 21.6 = 126.6, past the 100 px map. Left then fits: 95 - 10 - 21.6 = 63.4.
    const [label] = layoutLabels([{ key: 'P01', text: 'P01', x: 95, y: 50, priority: 0 }], { width: 100, height: 100 });
    expect(label.placement).toBe('left');
    expect(label.x).toBeCloseTo(63.4);
    expect(label.y).toBeCloseTo(54);
  });

  it('treats another marker as an obstacle', () => {
    // X's right label would run from 110 to 117.2, inside Y's marker (107 to 123). So X goes left: 100 - 10 - 7.2 = 82.8.
    // Y's right label then fits at 115 + 10 = 125.
    const out = layoutLabels([
      { key: 'X', text: 'A', x: 100, y: 100, priority: 0 },
      { key: 'Y', text: 'B', x: 115, y: 100, priority: 1 },
    ]);
    expect(out[0]).toMatchObject({ key: 'X', placement: 'left' });
    expect(out[0].x).toBeCloseTo(82.8);
    expect(out[1]).toMatchObject({ key: 'Y', placement: 'right' });
    expect(out[1].x).toBeCloseTo(125);
  });

  it('places a lone label at its right-hand position', () => {
    const [label] = layoutLabels([{ key: 'D01', text: 'D01', x: 300, y: 200, priority: 0 }]);
    expect(label).toMatchObject({ key: 'D01', placement: 'right' });
    expect(label.x).toBeCloseTo(310);
    expect(label.y).toBeCloseTo(204);
  });

  it('gives the same output for the same input (no randomness)', () => {
    const items: LabelItem[] = [
      { key: 'a', text: 'D01', x: 50, y: 50, priority: 0 },
      { key: 'b', text: 'P01', x: 58, y: 52, priority: 1 },
    ];
    expect(layoutLabels(items)).toEqual(layoutLabels(items));
  });
});
