import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { GAUGE_TICKS } from '../../../model/constants/viz/gauge-ticks.const';
import { STROKE_TONE_CLASSES } from '../../../model/constants/viz/stroke-tone-classes.const';
import { VizTone } from '../../../model/enums/viz/viz-tone.enum';
import { gaugeFilledTicks } from '../../../services/viz/gauge-fill';

/** Unfilled ticks — the track, at the same steps every other empty track in
 *  the kit uses. */
const TRACK_CLASS = 'stroke-surface-200 dark:stroke-surface-700';

/** Sweep pacing: 12 ms per tick fills the whole arc in under half a second,
 *  which reads as one gesture rather than forty. Collapses to nothing under
 *  `prefers-reduced-motion` (animations.scss). */
const TICK_DELAY_MS = 12;

/** The gauge card (23 CP-3) — the reference's *Repeat Customer Rate*: a
 *  segmented semicircular arc, the percentage large in the middle, a caption,
 *  and an optional detail link.
 *
 *  **Fill tone (closes 23 § Open ④):** the default is `accent`. A rate with no
 *  good/bad direction — repeat share, channel share, capacity — is exactly the
 *  "neutral rather than good/bad" case § Direction 3 assigns to the second
 *  brand voice. A metric that *does* have a direction (compliance against a
 *  target, overdue share) passes `Positive`/`Warning`/`Negative` and gets the
 *  fixed semantic set, so a tenant's hue can never make a bad rate look fine.
 *
 *  The arc is `role="img"` with the value in its `aria-label`: forty `<line>`
 *  elements are decoration to a screen reader, and the number in the middle is
 *  the reading. */
@Component({
  selector: 'app-gauge-card',
  imports: [RouterLink],
  templateUrl: './gauge-card.html',
  host: { class: 'card flex flex-col p-6' },
})
export class GaugeCard {
  title = input.required<string>();
  /** Percentage, 0–100. `null` renders an empty arc and an em dash — a rate
   *  that has no denominator yet is not 0 %. */
  value = input.required<number | null>();
  caption = input<string | null>(null);
  tone = input<VizTone>(VizTone.Accent);
  linkLabel = input<string | null>(null);
  linkRoute = input<string | null>(null);
  loading = input(false);

  protected readonly valueText = computed(() => {
    const value = this.value();
    return value === null ? '—' : `${Math.round(value)}%`;
  });

  /** Ticks resolved for the template: filled up to the value, each with its
   *  place in the sweep. */
  protected readonly ticks = computed(() => {
    const filled = gaugeFilledTicks(this.value(), GAUGE_TICKS.length);
    const fillClass = STROKE_TONE_CLASSES[this.tone()];
    return GAUGE_TICKS.map((tick) => ({
      ...tick,
      class: tick.index < filled ? `gauge-tick--on ${fillClass}` : TRACK_CLASS,
      delay: tick.index * TICK_DELAY_MS,
    }));
  });

  protected readonly ariaLabel = computed(() => {
    const caption = this.caption();
    const reading = `${this.title()}: ${this.valueText()}`;
    return caption ? `${reading}. ${caption}` : reading;
  });

  protected readonly hasLink = computed(() => !!this.linkLabel() && !!this.linkRoute());
}
