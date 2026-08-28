import { TestBed } from '@angular/core/testing';
import { provideStore } from '@ngxs/store';
import { TrendCard } from './trend-card';
import { AppState } from '../../../../state/app/app.state';
import { DeltaDirection } from '../../../model/enums/viz/delta-direction.enum';
import { VizTone } from '../../../model/enums/viz/viz-tone.enum';

const render = (inputs: Record<string, unknown>) => {
  TestBed.configureTestingModule({ providers: [provideStore([AppState])] });
  const fixture = TestBed.createComponent(TrendCard);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
};

/** Smoke for the trend card's chrome — header, legend and hero line, plus the
 *  empty reading.
 *
 *  The canvas itself is deliberately out of scope: chart.js needs a real 2D
 *  context, which jsdom does not have, so asserting a rendered line here would
 *  be asserting a mock. What the chart *is handed* — series colors re-read per
 *  theme, `tension`, no dots, legend off — is verified in the browser at CP-4,
 *  where the card meets real data. */

describe('TrendCard', () => {
  it('draws a legend chip per series, in the series’ own tone', () => {
    const host = render({
      title: 'Tendencia de captación',
      labels: [],
      series: [
        { label: 'Leads', data: [], tone: VizTone.Brand },
        { label: 'Nuevos activos', data: [], tone: VizTone.Accent },
      ],
    });
    expect(host.textContent).toContain('Tendencia de captación');
    expect(host.textContent).toContain('Leads');
    const dots = host.querySelectorAll('span.size-2');
    expect(dots[0]?.className).toContain('primary');
    expect(dots[1]?.className).toContain('accent');
  });

  it('renders the hero numeral with its delta and caption', () => {
    const host = render({
      title: 'Ingresos',
      labels: [],
      series: [],
      value: '$446.7K',
      delta: { text: '+24,4%', direction: DeltaDirection.Up },
      caption: 'contra el periodo anterior',
    });
    expect(host.textContent).toContain('$446.7K');
    expect(host.querySelector('.delta-pill')?.className).toContain('emerald');
    expect(host.textContent).toContain('contra el periodo anterior');
  });

  it('reads a period of zeros as empty, not as a flat line on the axis', () => {
    const host = render({
      title: 'Tendencia',
      labels: ['ene', 'feb'],
      series: [{ label: 'Leads', data: [0, 0], tone: VizTone.Brand }],
      emptyMessage: 'Sin captación en los últimos seis meses.',
    });
    expect(host.querySelector('p-chart')).toBeNull();
    expect(host.textContent).toContain('Sin captación en los últimos seis meses.');
  });

  it('holds the chart’s height while loading, so the card does not jump', () => {
    const host = render({
      title: 'Tendencia',
      labels: ['ene'],
      series: [{ label: 'Leads', data: [4], tone: VizTone.Brand }],
      loading: true,
    });
    expect(host.querySelector('p-chart')).toBeNull();
    expect(host.querySelector('.h-64')).not.toBeNull();
  });
});
