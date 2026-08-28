import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import {
  LucideCalendarClock,
  LucideDynamicIcon,
  LucideShare2,
  LucideTrendingUp,
  LucideUserCheck,
  LucideUserPlus,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { CustomerStatsState } from '../../../../state/customer-stats/customer-stats.state';
import {
  LoadFollowUps,
  LoadIntakeStats,
  LoadIntakeTrend,
  LoadRecentCustomers,
  LoadRecentInteractions,
} from '../../../../state/customer-stats/customer-stats.actions';
import { CUSTOMER_SOURCE_LABELS } from '../../../model/constants/customer/customer-source-labels.const';
import { DeltaDirection } from '../../../model/enums/viz/delta-direction.enum';
import { VizTone } from '../../../model/enums/viz/viz-tone.enum';
import {
  CustomerStatusLabelPipe,
  CustomerStatusSeverityPipe,
} from '../../../pipes/customer-status.pipe';
import { InteractionTypeIconPipe, InteractionTypeLabelPipe } from '../../../pipes/interaction.pipe';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import { GaugeCard } from '../../../shared/components/gauge-card/gauge-card';
import { KpiTile } from '../../../shared/components/kpi-tile/kpi-tile';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { SegmentedBar } from '../../../shared/components/segmented-bar/segmented-bar';
import { TrendCard } from '../../../shared/components/trend-card/trend-card';
import type { IntakeStats } from '../../../data/dtos/customer-stats';
import type { BarSegment } from '../../../data/types/viz/bar-segment.type';
import type { KpiDelta } from '../../../data/types/viz/kpi-delta.type';
import type { TrendSeries } from '../../../data/types/viz/trend-series.type';
import type {
  ChannelRowVM,
  KpiCardVM,
  PanelPeriodLabels,
  RecentClientVM,
} from '../../../data/types/crm/panel.types';
import { tableLoading } from '../../../services/table/table-loading';

/** How many channels keep their own named segment before the tail pools into
 *  "Otros" (23 CP-4). Two named plus the pool is the reference's three-segment
 *  bar, and it is also the palette's limit: the mix reads `primary` → `accent`
 *  → neutral, so a fourth distinct member would have to invent a colour role,
 *  and at a quarter-width card the labels stop fitting anyway. Nothing is
 *  hidden — every channel keeps its own row, with its split, in the detail
 *  list under the bar. */
const CHANNEL_SEGMENTS = 2;

/** Honest period naming (settled decision): the current MTD period reads
 *  "1–16 jul", a complete month reads its name. Dates are UTC buckets, so
 *  format in UTC to keep the boundaries truthful. */
const buildPeriodLabels = (stats: IntakeStats): PanelPeriodLabels => {
  const from = new Date(stats.period.from);
  const to = new Date(stats.period.to);
  const monthLong = new Intl.DateTimeFormat('es-MX', { month: 'long', timeZone: 'UTC' });
  const monthShort = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' });
  const fullMonth = stats.period.to.endsWith('-01T00:00:00.000Z');
  return {
    current: fullMonth ? monthLong.format(from) : `1–${to.getUTCDate()} ${monthShort.format(from)}`,
    previous: monthLong.format(new Date(stats.previous.from)),
  };
};

const TREND_MONTH_FMT = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' });

/** X-axis label for a 'YYYY-MM' bucket; past years carry a short year mark. */
const trendMonthLabel = (key: string): string => {
  const year = Number(key.slice(0, 4));
  const label = TREND_MONTH_FMT.format(new Date(`${key}-01T00:00:00.000Z`));
  return year === new Date().getUTCFullYear() ? label : `${label} ${String(year).slice(2)}`;
};

/** A period-over-period count difference, as the tile's delta: the sign is
 *  always shown, and the direction carries the colour (23 CP-3). */
const countDelta = (diff: number): KpiDelta => ({
  text: diff > 0 ? `+${diff}` : `${diff}`,
  direction: diff > 0 ? DeltaDirection.Up : diff < 0 ? DeltaDirection.Down : DeltaDirection.Flat,
});

/** Share of the period's intake already active, in whole percent (null when
 *  the period has no intake at all — which is not 0 %). */
const conversionRate = (active: number, leads: number): number | null => {
  const total = active + leads;
  return total === 0 ? null : Math.round((active / total) * 100);
};

/** Clientes › Dashboard — the CRM cockpit (executive redesign 2026-07-22,
 *  supersedes the two-pie layout; onto the shared viz kit at 23 CP-4): KPI
 *  strip (leads / nuevos activos / seguimientos vencidos), the six-month
 *  intake trend beside the channel mix and the conversión gauge, then newest
 *  clients + the detailed activity table.
 *
 *  Every hand-rolled chart surface is gone: the tiles are `kpi-tile`, the mix
 *  is `segmented-bar` over a detail list, the trend is `trend-card` — which
 *  took the chart plumbing (palette reads, the area fill, axis chrome, the
 *  tooltip, the theme-change re-read) with it, along with this file's
 *  `MutationObserver`. Conversión moved out of the strip and into a gauge:
 *  it is the only *rate* on the page, and a rate reads better as an arc than
 *  as a numeral.
 *
 *  The follow-ups fetch backs only its KPI count — the agenda table was
 *  dropped on the owner's ask. Data lives in `CustomerStatsState` so revisits
 *  render from cache. */
@Component({
  selector: 'app-crm-dashboard',
  imports: [
    RouterLink,
    TableModule,
    TagModule,
    TooltipModule,
    PageHeader,
    GaugeCard,
    KpiTile,
    SegmentedBar,
    TrendCard,
    LucideDynamicIcon,
    LucideShare2,
    CustomerStatusLabelPipe,
    CustomerStatusSeverityPipe,
    InteractionTypeIconPipe,
    InteractionTypeLabelPipe,
    RelativeTimePipe,
  ],
  templateUrl: './dashboard.html',
})
export class CrmDashboard {
  private readonly store = inject(Store);
  private readonly router = inject(Router);

  protected readonly stats = select(CustomerStatsState.intake);
  private readonly statsLoading = select(CustomerStatsState.intakeLoading);
  protected readonly statsError = signal(false);

  private readonly trend = select(CustomerStatsState.trend);
  private readonly trendLoading = select(CustomerStatsState.trendLoading);
  protected readonly trendError = signal(false);

  private readonly followUps = select(CustomerStatsState.followUps);
  private readonly followUpsLoading = select(CustomerStatsState.followUpsLoading);
  protected readonly followUpsError = signal(false);

  private readonly activity = select(CustomerStatsState.activity);
  private readonly activityLoading = select(CustomerStatsState.activityLoading);
  protected readonly activityError = signal(false);

  private readonly recentClients = select(CustomerStatsState.recentClients);
  private readonly clientsLoading = select(CustomerStatsState.recentClientsLoading);
  protected readonly clientsError = signal(false);

  /** Skeletons cover both the in-flight fetch and the pre-dispatch instant
   *  (no cache, no error yet). */
  protected readonly statsPending = computed(
    () => this.statsLoading() || (!this.stats() && !this.statsError()),
  );
  protected readonly trendPending = computed(
    () => this.trendLoading() || (!this.trend() && !this.trendError()),
  );
  protected readonly followUpsPending = computed(
    () => this.followUpsLoading() || (!this.followUps() && !this.followUpsError()),
  );
  protected readonly activityPending = computed(
    () => this.activityLoading() || (!this.activity() && !this.activityError()),
  );
  protected readonly clientsPending = computed(
    () => this.clientsLoading() || (!this.recentClients() && !this.clientsError()),
  );

  protected readonly activityRows = computed(() => this.activity() ?? []);

  protected readonly periodLabels = computed<PanelPeriodLabels | null>(() => {
    const stats = this.stats();
    return stats ? buildPeriodLabels(stats) : null;
  });

  protected readonly headerDescription = computed(() => {
    const labels = this.periodLabels();
    return labels
      ? `Captación, seguimientos y actividad — ${labels.current} contra ${labels.previous}.`
      : 'Captación, seguimientos y actividad de tus clientes.';
  });

  /** The intake-backed tiles. Conversión left the strip at 23 CP-4 — it is a
   *  rate, and it reads as the gauge below. */
  protected readonly intakeKpis = computed<KpiCardVM[]>(() => {
    const stats = this.stats();
    const labels = this.periodLabels();
    if (!stats || !labels) return [];
    const t = stats.totals;
    const vs = `contra ${labels.previous}`;
    return [
      {
        id: 'leads',
        label: 'Leads',
        value: `${t.leads}`,
        icon: LucideUserPlus,
        delta: countDelta(t.leads - t.prevLeads),
        caption: vs,
        tone: VizTone.Neutral,
      },
      {
        id: 'active',
        label: 'Nuevos activos',
        value: `${t.active}`,
        icon: LucideUserCheck,
        delta: countDelta(t.active - t.prevActive),
        caption: vs,
        tone: VizTone.Neutral,
      },
    ];
  });

  protected readonly followUpKpi = computed<KpiCardVM | null>(() => {
    const followUps = this.followUps();
    if (!followUps) return null;
    return {
      id: 'follow-ups',
      label: 'Seguimientos vencidos',
      value: `${followUps.overdueCount}`,
      icon: LucideCalendarClock,
      delta: null,
      caption: `De ${followUps.scheduledCount} programados`,
      // Overdue follow-ups above zero are bad *right now* — the one numeral on
      // the strip that reads red on its own value, not on a delta.
      tone: followUps.overdueCount > 0 ? VizTone.Negative : VizTone.Neutral,
    };
  });

  /** Conversión as a gauge (23 CP-4). Its tone stays the `accent` default: the
   *  share of intake that turned active is higher-is-better but has no target
   *  to be good or bad against, and inventing a threshold here would be
   *  inventing a business rule. */
  protected readonly conversionValue = computed(() => {
    const stats = this.stats();
    return stats ? conversionRate(stats.totals.active, stats.totals.leads) : null;
  });

  protected readonly conversionCaption = computed(() => {
    const stats = this.stats();
    const labels = this.periodLabels();
    if (!stats || !labels) return 'De la captación del periodo';
    const rate = conversionRate(stats.totals.active, stats.totals.leads);
    const prev = conversionRate(stats.totals.prevActive, stats.totals.prevLeads);
    if (rate === null || prev === null) return 'De la captación del periodo';
    const diff = rate - prev;
    return `${diff > 0 ? '+' : ''}${diff} pp contra ${labels.previous}`;
  });

  /** Both periods all-zero → the channel card shows the share-links CTA. */
  protected readonly intakeEmpty = computed(() => {
    const stats = this.stats();
    if (!stats) return false;
    const t = stats.totals;
    return t.leads + t.active + t.prevLeads + t.prevActive === 0;
  });

  protected readonly trendLabels = computed(() =>
    (this.trend()?.months ?? []).map((p) => trendMonthLabel(p.month)),
  );

  /** Hero series is the brand voice and carries the one sanctioned area fill;
   *  the second is `accent` — which is what plan 22 gave us in place of the
   *  old neutral-end `primary-1000` trick. */
  protected readonly trendSeries = computed<TrendSeries[]>(() => {
    const months = this.trend()?.months ?? [];
    return [
      { label: 'Leads', data: months.map((p) => p.leads), tone: VizTone.Brand, fill: true },
      { label: 'Nuevos activos', data: months.map((p) => p.active), tone: VizTone.Accent },
    ];
  });

  /** The mix, as the bar reads it: the top channels keep their own segment and
   *  the tail pools into "Otros", because past three members the palette has
   *  no distinct role left to give (and the labels stop fitting). Rows arrive
   *  sorted by current-period total (backend contract). */
  protected readonly channelSegments = computed<BarSegment[]>(() => {
    const rows = this.channelRows();
    const lead = rows.slice(0, CHANNEL_SEGMENTS).map((row, index) => ({
      id: row.source,
      label: row.source,
      count: row.total,
      tone: index === 0 ? VizTone.Brand : VizTone.Accent,
    }));
    const tail = rows.slice(CHANNEL_SEGMENTS);
    if (tail.length === 0) return lead;
    return [
      ...lead,
      {
        id: 'otros',
        label: tail.length === 1 ? tail[0]!.source : 'Otros',
        count: tail.reduce((sum, row) => sum + row.total, 0),
        tone: VizTone.Neutral,
      },
    ];
  });

  /** Every channel, with its leads/activos split — the detail under the bar. */
  protected readonly channelRows = computed<ChannelRowVM[]>(() => {
    const stats = this.stats();
    if (!stats) return [];
    return stats.rows
      .map((r) => ({ ...r, total: r.leads + r.active }))
      .filter((r) => r.total > 0)
      .map((r) => ({
        source: CUSTOMER_SOURCE_LABELS[r.source] ?? r.source,
        total: r.total,
        split: `${r.leads} leads · ${r.active} activos`,
      }));
  });

  protected readonly clientRows = computed<RecentClientVM[]>(() =>
    (this.recentClients() ?? []).map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: c.contactName && c.contactName !== c.name ? c.contactName : null,
      sourceLabel: CUSTOMER_SOURCE_LABELS[c.source] ?? c.source,
      createdAt: c.createdAt,
    })),
  );

  protected clientsBusy = tableLoading(this.clientsPending, this.clientRows);
  protected activityBusy = tableLoading(this.activityPending, this.activityRows);

  protected readonly skeletonRows = [0, 1, 2, 3, 4];
  /** Passed to `trend-card` as data, not rendered here — which is why
   *  `LucideTrendingUp` is imported but is not one of the component's
   *  template `imports` (NG8113). */
  protected readonly emptyTrendIcon = LucideTrendingUp;

  constructor() {
    this.loadStats();
    this.loadTrend();
    this.loadFollowUps();
    this.loadActivity();
    this.loadClients();
  }

  /** Whole row opens the client 360 view — same interaction as the customers
   *  list tables. */
  protected openCustomer(id: string): void {
    this.router.navigate(['/customers', id]);
  }

  protected loadStats(refresh = false): void {
    this.statsError.set(false);
    this.store.dispatch(new LoadIntakeStats(undefined, refresh)).subscribe({
      error: () => this.statsError.set(true),
    });
  }

  protected loadTrend(refresh = false): void {
    this.trendError.set(false);
    this.store.dispatch(new LoadIntakeTrend(6, refresh)).subscribe({
      error: () => this.trendError.set(true),
    });
  }

  protected loadFollowUps(refresh = false): void {
    this.followUpsError.set(false);
    this.store.dispatch(new LoadFollowUps(8, refresh)).subscribe({
      error: () => this.followUpsError.set(true),
    });
  }

  protected loadActivity(refresh = false): void {
    this.activityError.set(false);
    this.store.dispatch(new LoadRecentInteractions(20, refresh)).subscribe({
      error: () => this.activityError.set(true),
    });
  }

  protected loadClients(refresh = false): void {
    this.clientsError.set(false);
    this.store.dispatch(new LoadRecentCustomers(8, refresh)).subscribe({
      error: () => this.clientsError.set(true),
    });
  }
}
