import { LucideArrowDown, LucideArrowUp, LucideMinus, type LucideIcon } from '@lucide/angular';
import { DeltaDirection } from '../../enums/viz/delta-direction.enum';

/** The delta pill's glyph. Color alone never carries the reading (01 §
 *  Accessibility) — the arrow is what a color-blind reader sees, so `Flat`
 *  draws a dash rather than nothing. */
export const DELTA_DIRECTION_ICONS: Record<DeltaDirection, LucideIcon> = {
  [DeltaDirection.Up]: LucideArrowUp,
  [DeltaDirection.Down]: LucideArrowDown,
  [DeltaDirection.Flat]: LucideMinus,
};
