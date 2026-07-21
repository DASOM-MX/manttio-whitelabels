import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartModule } from 'primeng/chart';
import {
  LucideActivity,
  LucideDynamicIcon,
  LucideTrendingUp,
  LucideUserPlus,
} from '@lucide/angular';
import type { ChartData, ChartOptions } from 'chart.js';
import { select, Store } from '@ngxs/store';
import { CustomerStatsState } from '../../../../state/customer-stats/customer-stats.state';
import {
  LoadIntakeStats,
  LoadRecentCustomers,
  LoadRecentInteractions,
} from '../../../../state/customer-stats/customer-stats.actions';
import { CUSTOMER_SOURCE_LABELS } from '../../../model/constants/customer/customer-source-labels.const';
import { InteractionTypeIconPipe, InteractionTypeLabelPipe } from '../../../pipes/interaction.pipe';
import { RelativeTimePipe } from '../../../pipes/relative-time.pipe';
import type { IntakeStats } from '../../../data/dtos/customer-stats';
import type {
  PanelPeriodLabels,
  PanelTotalsVM,
  RecentClientVM,
} from '../../../data/types/cms/panel.types';

/** Effective palette color: the runtime brand CSS var when set, else the
 *  neutral fallback baked into tailwind.config.js (same "H S% L%" scheme). */
const hslVar = (name: string, fallback: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `hsl(${value || fallback})`;
};

const chartSeriesColors = (dark: boolean) => ({
  current: hslVar('--brand-primary-600', '220 10% 45%'),
  previous: dark
    ? hslVar('--brand-surface-700', '0 0% 36%')
    : hslVar('--brand-surface-300', '0 0% 82%'),
});

const buildChartOptions = (dark: boolean): ChartOptions<'bar'> => {
  const grid = dark ? hslVar('--brand-surface-800', '0 0% 28%') : hslVar('--brand-surface-200', '0 0% 90%');
  const ticks = dark ? hslVar('--brand-surface-400', '0 0% 70%') : hslVar('--brand-surface-600', '0 0% 45%');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    maintainAspectRatio: false,
    animation: reduced ? false : { duration: 300, easing: 'easeOutCubic' },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { color: ticks, usePointStyle: true, boxWidth: 8, boxHeight: 8 },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: ticks } },
      y: { beginAtZero: true, grid: { color: grid }, ticks: { color: ticks, precision: 0 } },
    },
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

const fmtDelta = (n: number): string => (n > 0 ? `+${n}` : `${n}`);

/** CMS › Panel (utm-params 03): the tenant's marketing-performance view —
 *  leads/actives per acquisition channel (current period vs full previous
 *  month) plus the latest activity and newest clients (owner/admin reads).
 *  Data lives in `CustomerStatsState` so revisits render from cache. */
@Component({
  selector: 'app-cms-dashboard',
  imports: [
    RouterLink,
    ChartModule,
    LucideActivity,
    LucideDynamicIcon,
    LucideTrendingUp,
    LucideUserPlus,
    InteractionTypeIconPipe,
    InteractionTypeLabelPipe,
    RelativeTimePipe,
  ],
  templateUrl: './dashboard.html',
})
export class CmsDashboard {
  private readonly store = inject(Store);

  protected readonly stats = select(CustomerStatsState.intake);
  private readonly statsLoading = select(CustomerStatsState.intakeLoading);
  protected readonly statsError = signal(false);

  private readonly activity = select(CustomerStatsState.activity);
  private readonly activityLoading = select(CustomerStatsState.activityLoading);
  protected readonly activityError = signal(false);

  private readonly recentClients = select(CustomerStatsState.recentClients);
  private readonly clientsLoading = select(CustomerStatsState.recentClientsLoading);
  protected readonly clientsError = signal(false);

  /** `<html>.app-dark` is the single dark-mode source of truth — watch it so
   *  chart colors follow the topbar toggle live. */
  private readonly dark = signal(document.documentElement.classList.contains('app-dark'));
  private readonly themeObserver = new MutationObserver(() =>
    this.dark.set(document.documentElement.classList.contains('app-dark')),
  );

  /** Skeletons cover both the in-flight fetch and the pre-dispatch instant
   *  (no cache, no error yet). */
  protected readonly statsPending = computed(
    () => this.statsLoading() || (!this.stats() && !this.statsError()),
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

  protected readonly totals = computed<PanelTotalsVM | null>(() => {
    const stats = this.stats();
    if (!stats) return null;
    return {
      leads: stats.totals.leads,
      active: stats.totals.active,
      leadsDelta: fmtDelta(stats.totals.leads - stats.totals.prevLeads),
      activeDelta: fmtDelta(stats.totals.active - stats.totals.prevActive),
    };
  });

  /** Both periods all-zero → the intake region shows its empty state. */
  protected readonly intakeEmpty = computed(() => {
    const stats = this.stats();
    if (!stats) return false;
    const t = stats.totals;
    return t.leads + t.active + t.prevLeads + t.prevActive === 0;
  });

  protected readonly chartOptions = computed<ChartOptions<'bar'>>(() =>
    buildChartOptions(this.dark()),
  );
  protected readonly leadsChart = computed(() => this.buildChart('leads', 'prevLeads'));
  protected readonly activeChart = computed(() => this.buildChart('active', 'prevActive'));

  protected readonly clientRows = computed<RecentClientVM[]>(() =>
    (this.recentClients() ?? []).map((c) => ({
      id: c.id,
      title: c.name,
      subtitle: c.contactName && c.contactName !== c.name ? c.contactName : null,
      sourceLabel: CUSTOMER_SOURCE_LABELS[c.source] ?? c.source,
      createdAt: c.createdAt,
    })),
  );

  protected readonly skeletonRows = [0, 1, 2, 3, 4];

  constructor() {
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    inject(DestroyRef).onDestroy(() => this.themeObserver.disconnect());
    this.loadStats();
    this.loadActivity();
    this.loadClients();
  }

  protected loadStats(refresh = false): void {
    this.statsError.set(false);
    this.store.dispatch(new LoadIntakeStats(undefined, refresh)).subscribe({
      error: () => this.statsError.set(true),
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

  private buildChart(
    currentKey: 'leads' | 'active',
    prevKey: 'prevLeads' | 'prevActive',
  ): ChartData<'bar', number[], string> | null {
    const stats = this.stats();
    const labels = this.periodLabels();
    if (!stats || !labels || !stats.rows.length) return null;
    const colors = chartSeriesColors(this.dark());
    return {
      labels: stats.rows.map((r) => CUSTOMER_SOURCE_LABELS[r.source] ?? r.source),
      datasets: [
        {
          label: labels.current,
          data: stats.rows.map((r) => r[currentKey]),
          backgroundColor: colors.current,
          borderRadius: 3,
        },
        {
          label: labels.previous,
          data: stats.rows.map((r) => r[prevKey]),
          backgroundColor: colors.previous,
          borderRadius: 3,
        },
      ],
    };
  }
}
