import { Injectable } from '@angular/core';
import type { Chart, TooltipModel } from 'chart.js';

/** Marks our node so a re-render finds it instead of stacking copies. */
const TOOLTIP_CLASS = 'chart-tooltip';

/** Distance the card floats above the caret, in px. */
const CARET_GAP = 12;

interface TooltipContext {
  chart: Chart;
  tooltip: TooltipModel<'line'>;
}

/** The reference's floating tooltip card — a real DOM card (date + one row
 *  per series: dot, label, value), not chart.js's canvas-drawn box.
 *
 *  Canvas tooltips can't take our card styling: no `.card` border, no
 *  `font-data` numerals, no theme tokens, and they blur on high-DPI. So the
 *  built-in one is switched off (`enabled: false`) and this renders a node
 *  inside the chart wrapper instead, which is why the wrapper has to be a
 *  positioned box (`relative`) — `trend-card` makes it one.
 *
 *  Nodes are built with `textContent`, never `innerHTML`: series labels and
 *  formatted values come from data, and a chart is not a place to open a
 *  markup injection path. */
@Injectable({ providedIn: 'root' })
export class ChartTooltipService {
  /** An `options.plugins.tooltip.external` handler bound to a wrapper the
   *  caller resolves lazily — the view child doesn't exist yet when the chart
   *  options are built. */
  handler(host: () => HTMLElement | null | undefined) {
    return (context: TooltipContext): void => {
      const element = host();
      if (element) this.render(element, context);
    };
  }

  private render(host: HTMLElement, { chart, tooltip }: TooltipContext): void {
    const card = this.card(host);

    if (tooltip.opacity === 0) {
      card.style.opacity = '0';
      return;
    }

    card.replaceChildren();

    const title = tooltip.title?.[0];
    if (title) {
      const heading = document.createElement('p');
      heading.className = 'chart-tooltip-title';
      heading.textContent = title;
      card.appendChild(heading);
    }

    for (const point of tooltip.dataPoints ?? []) {
      const row = document.createElement('p');
      row.className = 'chart-tooltip-row';

      const dot = document.createElement('span');
      dot.className = 'chart-tooltip-dot';
      dot.style.backgroundColor = this.seriesColor(point.dataset.borderColor);
      row.appendChild(dot);

      const label = document.createElement('span');
      label.className = 'chart-tooltip-label';
      label.textContent = point.dataset.label ?? '';
      row.appendChild(label);

      const value = document.createElement('span');
      value.className = 'chart-tooltip-value';
      value.textContent = point.formattedValue;
      row.appendChild(value);

      card.appendChild(row);
    }

    this.place(host, card, chart, tooltip);
    card.style.opacity = '1';
  }

  /** One node per wrapper, created on first hover and reused after. */
  private card(host: HTMLElement): HTMLElement {
    const existing = host.querySelector<HTMLElement>(`.${TOOLTIP_CLASS}`);
    if (existing) return existing;
    const card = document.createElement('div');
    card.className = TOOLTIP_CLASS;
    host.appendChild(card);
    return card;
  }

  /** Above the caret, centered on it, and clamped inside the wrapper so a
   *  hover on the first or last point doesn't push the card out of the card. */
  private place(
    host: HTMLElement,
    card: HTMLElement,
    chart: Chart,
    tooltip: TooltipModel<'line'>,
  ): void {
    const hostBox = host.getBoundingClientRect();
    const canvasBox = chart.canvas.getBoundingClientRect();
    const half = card.offsetWidth / 2;
    const x = canvasBox.left - hostBox.left + tooltip.caretX;
    const y = canvasBox.top - hostBox.top + tooltip.caretY;
    card.style.left = `${Math.min(Math.max(x, half), hostBox.width - half)}px`;
    card.style.top = `${y - CARET_GAP}px`;
  }

  /** Datasets carry a plain color string here (the palette service resolves
   *  every series before the chart is built); scriptable/array forms would
   *  need a canvas to resolve, so they fall back to the label color. */
  private seriesColor(borderColor: unknown): string {
    return typeof borderColor === 'string' ? borderColor : 'currentColor';
  }
}
