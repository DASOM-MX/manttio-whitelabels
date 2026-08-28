import { TestBed } from '@angular/core/testing';
import { KpiTile } from './kpi-tile';
import { DeltaDirection } from '../../../model/enums/viz/delta-direction.enum';
import { VizTone } from '../../../model/enums/viz/viz-tone.enum';

const render = (inputs: Record<string, unknown>) => {
  const fixture = TestBed.createComponent(KpiTile);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
};

/** Render smoke for the KPI tile: the three positions it promises (label,
 *  numeral, delta), and the loading swap that keeps a strip from jumping. */

describe('KpiTile', () => {
  it('renders the label, the numeral and the delta', () => {
    const host = render({
      label: 'Leads',
      value: '1,234',
      delta: { text: '+12', direction: DeltaDirection.Up },
      caption: 'contra junio',
    });
    expect(host.textContent).toContain('Leads');
    expect(host.textContent).toContain('1,234');
    expect(host.textContent).toContain('+12');
    expect(host.textContent).toContain('contra junio');
    expect(host.querySelector('.delta-pill')?.className).toContain('emerald');
  });

  it('tones the numeral without touching the rest', () => {
    const host = render({ label: 'Vencidos', value: '3', tone: VizTone.Negative });
    expect(host.querySelector('.font-data')?.className).toContain('text-red-600');
  });

  it('swaps the whole tile for skeleton bars while loading', () => {
    const host = render({ label: 'Leads', value: '1,234', loading: true });
    expect(host.querySelectorAll('.skeleton').length).toBe(3);
    expect(host.textContent).not.toContain('1,234');
  });
});
