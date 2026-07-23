import type { LucideIcon } from '@lucide/angular';
import type { CustomerStatus } from '../../dtos/customer';

/** View models for the CRM dashboard (utm-params 03; executive redesign
 *  2026-07-22) — mapped in computeds so templates stay free of function
 *  calls. */

/** Honest period naming (settled decision): MTD reads "1–16 jul", a complete
 *  month reads its name ("junio"). */
export interface PanelPeriodLabels {
  current: string;
  previous: string;
}

/** Signed delta on a stat card (01 stat-card idiom: colored text, sign always
 *  shown — "+3"); tone classes come from the component's tone map. */
export interface KpiDeltaVM {
  text: string;
  textClass: string;
}

/** One stat card of the dashboard KPI strip. */
export interface KpiCardVM {
  id: string;
  label: string;
  value: string;
  valueClass: string;
  icon: LucideIcon;
  delta: KpiDeltaVM | null;
  /** Small context line under the value ("contra junio", "de 12 programados"). */
  sub: string | null;
}

/** One proportional bar of the channel-mix card. Width is relative to the
 *  top channel (100), floored so tiny channels stay visible. */
export interface ChannelBarVM {
  source: string;
  total: number;
  split: string;
  widthPct: number;
}

export type FollowUpTone = 'overdue' | 'today' | 'upcoming';

/** One agenda row of the follow-ups card. */
export interface FollowUpVM {
  id: string;
  name: string;
  status: CustomerStatus;
  sourceLabel: string;
  dateLabel: string;
  /** Tone classes for the date pill (from the component's tone map). */
  dateClass: string;
}

/** Legend chip over the trend chart — dot color mirrors the dataset. */
export interface TrendSeriesChip {
  label: string;
  dotClass: string;
}

export interface RecentClientVM {
  id: string;
  title: string;
  subtitle: string | null;
  sourceLabel: string;
  createdAt: string;
}
