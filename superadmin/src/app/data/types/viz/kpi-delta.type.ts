import type { DeltaDirection } from '../../../model/enums/viz/delta-direction.enum';
import type { VizTone } from '../../../model/enums/viz/viz-tone.enum';

/** The delta pill beside a KPI value (01 § Stat cards, 23 CP-3).
 *
 *  `text` is pre-formatted by the caller **with its sign** ("+15,5 %", "−3",
 *  "+2 pp") — the tile prints it verbatim, so periods, percent points and
 *  locale separators stay the caller's business. `direction` draws the arrow;
 *  `tone` overrides the color for metrics where falling is the win (it
 *  defaults to the fixed semantic set — see `DeltaDirection`). */
export interface KpiDelta {
  text: string;
  direction: DeltaDirection;
  tone?: VizTone;
}
