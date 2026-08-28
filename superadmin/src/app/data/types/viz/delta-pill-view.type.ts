import type { LucideIcon } from '@lucide/angular';

/** A `KpiDelta` resolved for rendering — glyph and pill classes picked, text
 *  passed through. Built by `deltaPillView` so the tile and the trend card's
 *  hero draw the identical pill. */
export interface DeltaPillView {
  text: string;
  icon: LucideIcon;
  pillClass: string;
}
