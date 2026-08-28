import { Component, ElementRef, computed, inject, input, viewChild } from '@angular/core';
import { ChartModule } from 'primeng/chart';
import { LucideDynamicIcon, type LucideIcon } from '@lucide/angular';
import type { ChartData, ChartOptions } from 'chart.js';
import { select } from '@ngxs/store';
import { AppState } from '../../../../state/app/app.state';
import { RULE_TONE_CLASSES } from '../../../model/constants/viz/rule-tone-classes.const';
import { ChartPaletteService } from '../../../services/theme/chart-palette.service';
import { ChartTooltipService } from '../../../services/chart/chart-tooltip.service';
import { deltaPillView } from '../../../services/viz/delta-pill-view';
import type { KpiDelta } from '../../../data/types/viz/kpi-delta.type';
import type { TrendLegendChip } from '../../../data/types/viz/trend-legend-chip.type';
import type { TrendSeries } from '../../../data/types/viz/trend-series.type';

/** Alpha of the hero series' area fill — enough to read as a fill, faint
 *  enough that the y-grid stays visible through it. Dark mode carries a touch
 *  more, since it is lifting off `surface-900` rather than off white. */
const AREA_FILL_ALPHA = { light: 0.2, dark: 0.25 };

/** The trend card (01 § Data-viz, 23 CP-3) — the reference's *Total Profit*:
 *  hero numeral + delta + caption over a line chart.
 *
 *  It owns the whole chart contract so no page has to: `tension: 0.4`, no
 *  point dots, faint y-grid only, chart.js's own legend off (the legend is dot
 *  chips in the header), the one sanctioned single-hue area fill under the
 *  hero series, and the floating tooltip card. Series take a `VizTone`, not a
 *  color — hero `Brand`, second voice `Accent`.
 *
 *  **Colors are re-read on every theme change.** They resolve from the
 *  `--brand-*` variables through `ChartPaletteService`, and the computeds
 *  depend on `AppState.darkMode` — the same signal `app.ts` mirrors onto
 *  `<html>.app-dark` — so a toggle rebuilds the palette instead of leaving a
 *  light-mode line on a dark card.
 *
 *  The `h-64` wrapper with host + inner `h-full` is not decoration: PrimeNG 21
 *  ignores `styleClass` on `p-chart`, and a canvas with no bounded parent
 *  grows without limit. The wrapper is also the tooltip's positioning box.
 *
 *  Loading and empty are the card's; **errors are the call site's** — a retry
 *  needs an action the card knows nothing about. */
@Component({
  selector: 'app-trend-card',
  imports: [ChartModule, LucideDynamicIcon],
  templateUrl: './trend-card.html',
  host: { class: 'card flex flex-col p-6' },
})
export class TrendCard {
  private readonly palette = inject(ChartPaletteService);
  private readonly tooltips = inject(ChartTooltipService);

  title = input.required<string>();
  /** X-axis categories — one per point of every series. */
  labels = input.required<string[]>();
  series = input.required<TrendSeries[]>();
  /** The hero line above the chart: a formatted numeral, its delta pill, and
   *  a muted caption. All optional — a card that is only a chart passes none. */
  value = input<string | null>(null);
  delta = input<KpiDelta | null>(null);
  caption = input<string | null>(null);
  loading = input(false);
  emptyIcon = input<LucideIcon>();
  emptyMessage = input('Sin datos en el periodo.');

  private readonly chartHost = viewChild<ElementRef<HTMLElement>>('chartHost');
  private readonly dark = select(AppState.darkMode);

  /** Bound once: the wrapper doesn't exist when the options are first built,
   *  so the handler resolves it lazily on each hover. */
  private readonly tooltipHandler = this.tooltips.handler(() => this.chartHost()?.nativeElement);

  protected readonly deltaView = computed(() => deltaPillView(this.delta()));

  protected readonly legend = computed<TrendLegendChip[]>(() =>
    this.series().map((serie) => ({
      label: serie.label,
      dotClass: RULE_TONE_CLASSES[serie.tone],
    })),
  );

  /** A series of zeros is not a trend — it is an empty period, and it renders
   *  as the empty state rather than a flat line pinned to the axis. */
  protected readonly isEmpty = computed(() => {
    const series = this.series();
    return (
      series.length === 0 ||
      series.every((serie) => serie.data.length === 0 || serie.data.every((point) => point === 0))
    );
  });

  protected readonly chartData = computed<ChartData<'line', number[], string> | null>(() => {
    if (this.isEmpty()) return null;
    const dark = this.dark();
    return {
      labels: this.labels(),
      datasets: this.series().map((serie) => {
        const color = this.palette.color(serie.tone, dark);
        const fillAlpha = dark ? AREA_FILL_ALPHA.dark : AREA_FILL_ALPHA.light;
        return {
          label: serie.label,
          data: serie.data,
          borderColor: color,
          pointBackgroundColor: color,
          backgroundColor: serie.fill
            ? this.palette.areaFill(this.palette.color(serie.tone, dark, fillAlpha))
            : color,
          borderWidth: 2,
          tension: 0.4,
          fill: !!serie.fill,
        };
      }),
    };
  });

  protected readonly chartOptions = computed<ChartOptions<'line'>>(() => {
    const dark = this.dark();
    const tick = this.palette.axisTick(dark);
    const grid = this.palette.axisGrid(dark);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return {
      maintainAspectRatio: false,
      animation: reduced ? false : { duration: 400, easing: 'easeOutCubic' },
      // Index mode: the tooltip card lists every series at the hovered
      // category, which is what makes it worth being a card.
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false, external: this.tooltipHandler },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: tick },
        },
        y: {
          beginAtZero: true,
          grid: { color: grid },
          border: { display: false },
          ticks: { color: tick, precision: 0, maxTicksLimit: 5 },
        },
      },
      elements: { point: { radius: 0, hoverRadius: 4, hitRadius: 12 } },
    };
  });
}
