/** View models for the CMS Panel page (utm-params 03) — mapped in computeds
 *  so templates stay free of function calls. */

/** Honest period naming (settled decision): MTD reads "1–16 jul", a complete
 *  month reads its name ("junio"). */
export interface PanelPeriodLabels {
  current: string;
  previous: string;
}

export interface PanelTotalsVM {
  leads: number;
  active: number;
  leadsDelta: string;
  activeDelta: string;
}

export interface RecentClientVM {
  id: string;
  title: string;
  subtitle: string | null;
  sourceLabel: string;
  createdAt: string;
}
