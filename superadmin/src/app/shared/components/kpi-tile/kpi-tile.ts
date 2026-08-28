import { Component, computed, input } from '@angular/core';
import { LucideDynamicIcon, type LucideIcon } from '@lucide/angular';
import { VALUE_TONE_CLASSES } from '../../../model/constants/viz/value-tone-classes.const';
import { VizTone } from '../../../model/enums/viz/viz-tone.enum';
import { deltaPillView } from '../../../services/viz/delta-pill-view';
import type { KpiDelta } from '../../../data/types/viz/kpi-delta.type';

/** The KPI tile (01 § Stat cards, 23 CP-3) — the reference's dashboard strip
 *  unit, and the only unit tighter than the page rhythm (`p-5`).
 *
 *  Micro-label + trailing icon, a `font-data` numeral, the delta pill beside
 *  it (arrow + signed text, emerald/red per the fixed semantic set), and a
 *  muted comparison caption underneath. `loading` swaps the whole tile for
 *  `.skeleton` bars in the same three positions, so a strip doesn't jump when
 *  its numbers land.
 *
 *  The tile takes **formatted strings**, not numbers: currency, percent points
 *  and locale separators are the caller's business, and a shared tile that
 *  guessed would be wrong on half the dashboards. What it does own is the
 *  palette — pass a `VizTone`, never a class. Hand-rolling a fifth copy of a
 *  KPI strip after this exists is a review failure (01 § Data-viz).
 *
 *  The trailing glyph rides `accent`: it is decorative, and decoration is the
 *  second brand voice (§ Direction 3). A tenant with no accent set renders it
 *  in the neutral fallback ramp — correct, not a regression (branding rule 3). */
@Component({
  selector: 'app-kpi-tile',
  imports: [LucideDynamicIcon],
  templateUrl: './kpi-tile.html',
  host: { class: 'card flex items-start justify-between gap-4 p-5' },
})
export class KpiTile {
  label = input.required<string>();
  value = input.required<string>();
  icon = input<LucideIcon>();
  delta = input<KpiDelta | null>(null);
  caption = input<string | null>(null);
  /** Tone of the numeral itself — `Neutral` for the vast majority; a metric
   *  that is *bad right now* (overdue follow-ups above zero) reads `Negative`. */
  tone = input<VizTone>(VizTone.Neutral);
  loading = input(false);

  protected readonly valueClass = computed(() => VALUE_TONE_CLASSES[this.tone()]);

  protected readonly deltaView = computed(() => deltaPillView(this.delta()));
}
