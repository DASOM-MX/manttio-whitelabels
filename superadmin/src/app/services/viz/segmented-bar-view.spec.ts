import { segmentedBarView } from './segmented-bar-view';
import { VizTone } from '../../model/enums/viz/viz-tone.enum';
import type { BarSegment } from '../../data/types/viz/bar-segment.type';

const segment = (id: string, count: number, tone = VizTone.Brand): BarSegment => ({
  id,
  label: id,
  count,
  tone,
});

/** Specs for the segmented bar's math — every one asserts an edge the doc
 *  comment warns about: the floor for narrow members, the two degradations,
 *  and the invariant that the row always fills the track. */

describe('segmentedBarView', () => {
  it('splits proportionally when nothing needs the floor', () => {
    const view = segmentedBarView([segment('a', 50), segment('b', 30), segment('c', 20)]);
    expect(view.map((s) => s.widthPct)).toEqual([50, 30, 20]);
  });

  it('floors a narrow member and renormalizes, so the row still fills the track', () => {
    const view = segmentedBarView([segment('a', 98), segment('b', 2)]);
    const [wide, narrow] = view;
    expect(narrow?.widthPct).toBeGreaterThan(2);
    expect(wide!.widthPct + narrow!.widthPct).toBeCloseTo(100);
  });

  it('always sums to the full track, floors or not', () => {
    const view = segmentedBarView([segment('a', 1), segment('b', 1), segment('c', 400)]);
    expect(view.reduce((sum, s) => sum + s.widthPct, 0)).toBeCloseTo(100);
  });

  it('degrades a lone segment to the neutral rule', () => {
    const [solo] = segmentedBarView([segment('a', 12, VizTone.Brand)]);
    expect(solo?.ruleClass).toContain('surface');
    expect(solo?.ruleClass).not.toContain('primary');
  });

  it('keeps each tone once there is a mix to read', () => {
    const view = segmentedBarView([
      segment('a', 5, VizTone.Brand),
      segment('b', 5, VizTone.Accent),
    ]);
    expect(view[0]?.ruleClass).toContain('primary');
    expect(view[1]?.ruleClass).toContain('accent');
  });

  it('returns nothing at total 0 — the component draws a bare track', () => {
    expect(segmentedBarView([segment('a', 0), segment('b', 0)])).toEqual([]);
    expect(segmentedBarView([])).toEqual([]);
  });

  it('clamps a negative count instead of dragging the whole mix negative', () => {
    const view = segmentedBarView([segment('a', 10), segment('b', -4)]);
    expect(view.reduce((sum, s) => sum + s.widthPct, 0)).toBeCloseTo(100);
    expect(view[1]?.widthPct).toBeGreaterThan(0);
  });

  it('prints counts with separators unless the caller formats its own', () => {
    const view = segmentedBarView([
      segment('a', 2884),
      { id: 'b', label: 'b', count: 1432, tone: VizTone.Accent, valueText: '1,4 k' },
    ]);
    expect(view[0]?.valueText).toBe('2,884');
    expect(view[1]?.valueText).toBe('1,4 k');
  });
});
