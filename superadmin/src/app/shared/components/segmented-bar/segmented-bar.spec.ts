import { TestBed } from '@angular/core/testing';
import { SegmentedBar } from './segmented-bar';
import { VizTone } from '../../../model/enums/viz/viz-tone.enum';
import type { BarSegment } from '../../../data/types/viz/bar-segment.type';

const MIX: BarSegment[] = [
  { id: 'retail', label: 'Retailers', count: 2884, tone: VizTone.Brand },
  { id: 'dist', label: 'Distributors', count: 1432, tone: VizTone.Accent },
  { id: 'whole', label: 'Wholesalers', count: 562, tone: VizTone.Neutral },
];

const render = (inputs: Record<string, unknown>) => {
  const fixture = TestBed.createComponent(SegmentedBar);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
};

/** Render smoke for the segmented bar — the math is covered in
 *  `segmented-bar-view.spec.ts`; what is asserted here is that the mix
 *  actually reaches the DOM as widths, and that the two degradations render
 *  something rather than nothing. */

describe('SegmentedBar', () => {
  it('draws one column per segment, with its share as the width', () => {
    const host = render({ segments: MIX });
    const columns = host.querySelectorAll<HTMLElement>('[style*="width"]');
    expect(columns.length).toBe(3);
    expect(host.textContent).toContain('Retailers');
    expect(host.textContent).toContain('2,884');
    expect(parseFloat(columns[0]!.style.width)).toBeGreaterThan(
      parseFloat(columns[2]!.style.width),
    );
  });

  it('rounds only the outer ends, so the segments read as one bar', () => {
    const host = render({ segments: MIX });
    const rules = host.querySelectorAll('span.h-1');
    expect(rules[0]?.className).toContain('rounded-l-full');
    expect(rules[1]?.className).not.toContain('rounded');
    expect(rules[2]?.className).toContain('rounded-r-full');
  });

  it('collapses to an empty track when the period has no data', () => {
    const host = render({ segments: [], emptyLabel: 'Sin captación.' });
    expect(host.querySelectorAll('[style*="width"]').length).toBe(0);
    expect(host.textContent).toContain('Sin captación.');
  });
});
