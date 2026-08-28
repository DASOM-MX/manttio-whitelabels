import type { LucideIcon } from '@lucide/angular';
import type { KpiDelta } from '../viz/kpi-delta.type';
import type { VizTone } from '../../../model/enums/viz/viz-tone.enum';

/** View models for the CRM dashboard (utm-params 03; executive redesign
 *  2026-07-22; onto the viz kit at 23 CP-4) — mapped in computeds so templates
 *  stay free of function calls. */

/** Honest period naming (settled decision): MTD reads "1–16 jul", a complete
 *  month reads its name ("junio"). */
export interface PanelPeriodLabels {
  current: string;
  previous: string;
}

/** One tile of the KPI strip, in `kpi-tile`'s own vocabulary: the delta is a
 *  `KpiDelta` (direction + optional tone override) and the value's colour is a
 *  `VizTone`, not a class — the tile owns the palette (23 CP-3). */
export interface KpiCardVM {
  id: string;
  label: string;
  value: string;
  icon: LucideIcon;
  delta: KpiDelta | null;
  /** Small context line under the value ("contra junio", "de 12 programados"). */
  caption: string | null;
  tone: VizTone;
}

/** One row of the channel card's detail list, under the segmented bar. It
 *  carries no bar of its own since 23 CP-4 — the mix's *shape* is the
 *  segmented bar above it, and a second set of bars said the same thing twice
 *  in a quarter-width card. */
export interface ChannelRowVM {
  source: string;
  total: number;
  split: string;
}

export interface RecentClientVM {
  id: string;
  title: string;
  subtitle: string | null;
  sourceLabel: string;
  createdAt: string;
}
