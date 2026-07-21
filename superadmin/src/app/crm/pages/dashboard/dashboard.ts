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
} from '../../../data/types/crm/panel.types';

/** Effective palette color: the runtime brand CSS var when set, else the
 *  neutral fallback baked into tailwind.config.js (same "H S% L%" scheme). */
const hslVar = (name: string, fallback: string): string => {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return `hsl(${value || fallback})`;
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

/** Single-hue slice ramp (01: color arrives through the palette scales —
 *  distinct primary steps, cycled; never a multi-hue chart palette). */
const SLICE_STEPS = [600, 300, 800, 400, 900, 200, 700, 500, 1000, 100];

const sliceColors = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => primaryStep(SLICE_STEPS[i % SLICE_STEPS.length]));

const buildPieOptions = (dark: boolean): ChartOptions<'pie'> => {
  const legend = dark ? hslVar('--brand-surface-400', '0 0% 70%') : hslVar('--brand-surface-600', '0 0% 45%');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    maintainAspectRatio: false,
    animation: reduced ? false : { duration: 300, easing: 'easeOutCubic' },
    plugins: {
      legend: {
        position: 'right',
        labels: { color: legend, usePointStyle: true, boxWidth: 8, boxHeight: 8 },
      },
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

/** Clientes › Dashboard (utm-params 03, relocated to the CRM group
 *  2026-07-20): current-period channel mix as pies (previous-month comparison
 *  lives in the KPI deltas — owner 2026-07-20, supersedes grouped bars) plus
 *  the latest activity and newest clients. Fixed card heights (owner
 *  2026-07-21): charts capped at 325px, lists capped at max-h-96 with
 *  internal y-scroll. Data lives in `CustomerStatsState` so revisits render
 *  from cache. */
@Component({
  selector: 'app-crm-dashboard',
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
export class CrmDashboard {
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

  protected readonly chartOptions = computed<ChartOptions<'pie'>>(() =>
    buildPieOptions(this.dark()),
  );
  protected readonly leadsChart = computed(() => this.buildPie('leads'));
  protected readonly activeChart = computed(() => this.buildPie('active'));

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

  /** Current-period channel mix. Zero channels are dropped — invisible
   *  slices would only clutter the legend. */
  private buildPie(key: 'leads' | 'active'): ChartData<'pie', number[], string> | null {
    const stats = this.stats();
    if (!stats) return null;
    const rows = stats.rows.filter((r) => r[key] > 0);
    if (!rows.length) return null;
    const border = this.dark() ? hslVar('--brand-surface-900', '0 0% 18%') : '#ffffff';
    return {
      labels: rows.map((r) => CUSTOMER_SOURCE_LABELS[r.source] ?? r.source),
      datasets: [
        {
          data: rows.map((r) => r[key]),
          backgroundColor: sliceColors(rows.length),
          borderColor: border,
          borderWidth: 2,
        },
      ],
    };
  }
}
