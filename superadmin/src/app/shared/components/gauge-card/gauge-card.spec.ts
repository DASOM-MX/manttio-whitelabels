import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { GaugeCard } from './gauge-card';
import { GAUGE_TICKS } from '../../../model/constants/viz/gauge-ticks.const';
import { VizTone } from '../../../model/enums/viz/viz-tone.enum';

const render = (inputs: Record<string, unknown>) => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  const fixture = TestBed.createComponent(GaugeCard);
  for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
};

/** Render smoke for the gauge. The fill math is covered in
 *  `gauge-fill.spec.ts`; here the arc has to actually reach the DOM — and the
 *  per-tick class has to carry BOTH the static `gauge-tick` geometry and the
 *  bound state class, which is the one thing a `[class]` binding could
 *  plausibly get wrong. */

describe('GaugeCard', () => {
  it('draws the full arc and fills it up to the value', () => {
    const host = render({ title: 'Conversión', value: 50, caption: 'Meta 80%' });
    const ticks = host.querySelectorAll('line');
    expect(ticks.length).toBe(GAUGE_TICKS.length);
    expect(host.querySelectorAll('line.gauge-tick--on').length).toBe(GAUGE_TICKS.length / 2);
    expect(host.textContent).toContain('50%');
    expect(host.textContent).toContain('Meta 80%');
  });

  it('keeps the tick geometry class alongside the bound state class', () => {
    const host = render({ title: 'Conversión', value: 100, tone: VizTone.Positive });
    const tick = host.querySelector('line');
    expect(tick?.getAttribute('class')).toContain('gauge-tick');
    expect(tick?.getAttribute('class')).toContain('gauge-tick--on');
    expect(tick?.getAttribute('class')).toContain('stroke-emerald-500');
  });

  it('reads an em dash and an empty arc when there is no rate yet', () => {
    const host = render({ title: 'Conversión', value: null });
    expect(host.querySelectorAll('line.gauge-tick--on').length).toBe(0);
    expect(host.textContent).toContain('—');
  });

  it('carries the reading in the arc’s aria-label, not just in the numeral', () => {
    const host = render({ title: 'Conversión', value: 68, caption: 'Meta 80%' });
    expect(host.querySelector('svg')?.getAttribute('aria-label')).toBe('Conversión: 68%. Meta 80%');
  });
});
