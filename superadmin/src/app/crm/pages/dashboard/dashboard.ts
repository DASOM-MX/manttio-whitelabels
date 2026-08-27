import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ChartModule } from 'primeng/chart';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import {
  LucideCalendarClock,
  LucideDynamicIcon,
  LucidePercent,
  LucideShare2,
  LucideTrendingUp,
  LucideUserCheck,
  LucideUserPlus,
} from '@lucide/angular';
import type { ChartData, ChartOptions, ScriptableContext } from 'chart.js';
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
import {
  CustomerStatusLabelPipe,
  CustomerStatusSeverityPipe,
} from '../../../pipes/customer-status.pipe';
import { InteractionTypeIconPipe, InteractionTypeLabelPipe } from '../../../pipes/interaction.pipe';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import type { IntakeStats } from '../../../data/dtos/customer-stats';
import type {
  ChannelBarVM,
  KpiCardVM,
  KpiDeltaVM,
  PanelPeriodLabels,
  RecentClientVM,
  TrendSeriesChip,
} from '../../../data/types/crm/panel.types';
import { tableLoading } from '../../../services/table/table-loading';

/** Effective palette color: the runtime brand CSS var when set, else the
 *  neutral fallback baked into tailwind.config.js (same "H S% L%" scheme). */
const hslVar = (name: string, fallback: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `hsl(${value || fallback})`;
};

/** Same var, with an alpha channel (modern space-separated hsl syntax —
 *  canvas gradients parse it fine). */
const hslVarAlpha = (name: string, fallback: string, alpha: number): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `hsl(${value || fallback} / ${alpha})`;
};

// tailwind.config.js neutralScale lightness per step — the no-brand fallback.
const PRIMARY_FALLBACK_L: Record<number, number> = {
  0: 98,
  100: 96,
  200: 90,
  300: 82,
  400: 70,
  500: 55,
  600: 45,
  700: 36,
  800: 28,
  900: 18,
  1000: 10,
};

const primaryStep = (step: number): string =>
  hslVar(`--brand-primary-${step}`, `220 10% ${PRIMARY_FALLBACK_L[step]}%`);

const primaryStepAlpha = (step: number, alpha: number): string =>
  hslVarAlpha(`--brand-primary-${step}`, `220 10% ${PRIMARY_FALLBACK_L[step]}%`, alpha);

/** The one sanctioned gradient (01 Design language): a subtle single-hue
 *  area fill under the hero trend line, fading to transparent. */
const areaFill =
  (topColor: string) =>
  (context: ScriptableContext<'line'>): string | CanvasGradient => {
    const { ctx, chartArea } = context.chart;
    if (!chartArea) return 'transparent';
    const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    gradient.addColorStop(0, topColor);
    gradient.addColorStop(1, 'transparent');
    return gradient;
  };

// Chart chrome rides the **fixed** neutral (22 § Target 3), so these are
// literals: surface stopped being tenant-themable and emits no CSS variable to
// read. Steps 400/500 for ticks, 800/200 for grid lines — the same values the
// old `--brand-surface-*` lookups fell back to.
const SURFACE_TICK = { dark: '0 0% 70%', light: '0 0% 55%' };
const SURFACE_GRID = { dark: '0 0% 28%', light: '0 0% 90%' };

const buildLineOptions = (dark: boolean): ChartOptions<'line'> => {
  const tick = `hsl(${dark ? SURFACE_TICK.dark : SURFACE_TICK.light})`;
  const grid = dark
    ? `hsl(${SURFACE_GRID.dark} / 0.6)`
    : `hsl(${SURFACE_GRID.light} / 0.8)`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    maintainAspectRatio: false,
    animation: reduced ? false : { duration: 400, easing: 'easeOutCubic' },
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { display: false } },
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
};

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

// Stat-card deltas are signed colored text, never pills (01 stat-card idiom).
const DELTA_TONE_CLASSES = {
  up: 'text-emerald-600 dark:text-emerald-400',
  down: 'text-red-600 dark:text-red-400',
  flat: 'text-surface-500 dark:text-surface-400',
} as const;

const VALUE_NEUTRAL = 'text-surface-1000 dark:text-surface-0';
const VALUE_DANGER = 'text-red-600 dark:text-red-400';

const countDelta = (diff: number): KpiDeltaVM => ({
  text: diff > 0 ? `+${diff}` : `${diff}`,
  textClass: DELTA_TONE_CLASSES[diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat'],
});

/** Share of the period's intake already active, in whole percent (null when
 *  the period has no intake at all). */
const conversionRate = (active: number, leads: number): number | null => {
  const total = active + leads;
  return total === 0 ? null : Math.round((active / total) * 100);
};

/** Clientes › Dashboard — the CRM cockpit (executive redesign 2026-07-22,
 *  supersedes the two-pie layout): KPI strip (leads / nuevos activos /
 *  conversión / seguimientos vencidos), six-month intake trend with the
 *  sanctioned single-hue area fill + newest clients on its rail, and
 *  channel-mix bars + the detailed activity table (customer status + author).
 *  The follow-ups fetch now backs only its KPI count — the agenda table was
 *  dropped on the owner's ask. Data lives in `CustomerStatsState` so revisits
 *  render from cache. */
@Component({
  selector: 'app-crm-dashboard',
  imports: [
    RouterLink,
    ChartModule,
    TableModule,
    TagModule,
    TooltipModule,
    PageHeader,
    LucideDynamicIcon,
    LucideShare2,
    LucideTrendingUp,
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

  /** `<html>.app-dark` is the single dark-mode source of truth — watch it so
   *  chart colors follow the theme toggle live. */
  private readonly dark = signal(document.documentElement.classList.contains('app-dark'));
  private readonly themeObserver = new MutationObserver(() =>
    this.dark.set(document.documentElement.classList.contains('app-dark')),
  );

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

  /** Cards 1–3 of the KPI strip (intake-backed); the follow-ups KPI rides
   *  its own endpoint below. */
  protected readonly intakeKpis = computed<KpiCardVM[]>(() => {
    const stats = this.stats();
    const labels = this.periodLabels();
    if (!stats || !labels) return [];
    const t = stats.totals;
    const vs = `contra ${labels.previous}`;
    const rate = conversionRate(t.active, t.leads);
    const prevRate = conversionRate(t.prevActive, t.prevLeads);
    const rateDelta: KpiDeltaVM | null =
      rate !== null && prevRate !== null
        ? {
            text: `${rate - prevRate > 0 ? '+' : ''}${rate - prevRate} pp`,
            textClass:
              DELTA_TONE_CLASSES[rate > prevRate ? 'up' : rate < prevRate ? 'down' : 'flat'],
          }
        : null;
    return [
      {
        id: 'leads',
        label: 'Leads',
        value: `${t.leads}`,
        valueClass: VALUE_NEUTRAL,
        icon: LucideUserPlus,
        delta: countDelta(t.leads - t.prevLeads),
        sub: vs,
      },
      {
        id: 'active',
        label: 'Nuevos activos',
        value: `${t.active}`,
        valueClass: VALUE_NEUTRAL,
        icon: LucideUserCheck,
        delta: countDelta(t.active - t.prevActive),
        sub: vs,
      },
      {
        id: 'conversion',
        label: 'Conversión',
        value: rate === null ? '—' : `${rate}%`,
        valueClass: VALUE_NEUTRAL,
        icon: LucidePercent,
        delta: rateDelta,
        sub: 'De la captación del periodo',
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
      valueClass: followUps.overdueCount > 0 ? VALUE_DANGER : VALUE_NEUTRAL,
      icon: LucideCalendarClock,
      delta: null,
      sub: `De ${followUps.scheduledCount} programados`,
    };
  });

  /** Both periods all-zero → the channel card shows the share-links CTA. */
  protected readonly intakeEmpty = computed(() => {
    const stats = this.stats();
    if (!stats) return false;
    const t = stats.totals;
    return t.leads + t.active + t.prevLeads + t.prevActive === 0;
  });

  protected readonly chartOptions = computed<ChartOptions<'line'>>(() =>
    buildLineOptions(this.dark()),
  );

  /** Legend chips mirror the dataset colors (hero = brand primary, secondary
   *  = the dark/light neutral end of the same scale). */
  protected readonly trendSeries: TrendSeriesChip[] = [
    { label: 'Leads', dotClass: 'bg-primary-600 dark:bg-primary-400' },
    { label: 'Nuevos activos', dotClass: 'bg-primary-1000 dark:bg-primary-100' },
  ];

  protected readonly trendEmpty = computed(() => {
    const trend = this.trend();
    return !!trend && trend.months.every((p) => p.leads + p.active === 0);
  });

  protected readonly trendChart = computed<ChartData<'line', number[], string> | null>(() => {
    const trend = this.trend();
    if (!trend || this.trendEmpty()) return null;
    const dark = this.dark();
    const leadsColor = dark ? primaryStep(400) : primaryStep(600);
    const activeColor = dark ? primaryStep(100) : primaryStep(1000);
    // Fill rides the decorative accent step (01: primary-400 owns chart fills).
    const fillTop = primaryStepAlpha(400, dark ? 0.25 : 0.2);
    return {
      labels: trend.months.map((p) => trendMonthLabel(p.month)),
      datasets: [
        {
          label: 'Leads',
          data: trend.months.map((p) => p.leads),
          borderColor: leadsColor,
          pointBackgroundColor: leadsColor,
          borderWidth: 2,
          tension: 0.4,
          fill: true,
          backgroundColor: areaFill(fillTop),
        },
        {
          label: 'Nuevos activos',
          data: trend.months.map((p) => p.active),
          borderColor: activeColor,
          pointBackgroundColor: activeColor,
          backgroundColor: activeColor,
          borderWidth: 2,
          tension: 0.4,
          fill: false,
        },
      ],
    };
  });

  /** Channel-mix bars — the intake rows arrive sorted by current-period
   *  total already (backend contract); width is relative to the top one. */
  protected readonly channelBars = computed<ChannelBarVM[]>(() => {
    const stats = this.stats();
    if (!stats) return [];
    const rows = stats.rows
      .map((r) => ({ ...r, total: r.leads + r.active }))
      .filter((r) => r.total > 0);
    const max = Math.max(...rows.map((r) => r.total), 1);
    return rows.map((r) => ({
      source: CUSTOMER_SOURCE_LABELS[r.source] ?? r.source,
      total: r.total,
      split: `${r.leads} leads · ${r.active} activos`,
      widthPct: Math.max(Math.round((r.total / max) * 100), 4),
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

  constructor() {
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    inject(DestroyRef).onDestroy(() => this.themeObserver.disconnect());
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
