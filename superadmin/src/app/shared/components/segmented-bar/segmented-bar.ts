import { Component, computed, input } from '@angular/core';
import { segmentedBarView } from '../../../services/viz/segmented-bar-view';
import type { BarSegment } from '../../../data/types/viz/bar-segment.type';

/** The segmented bar (23 CP-3) — the reference's *Customers* card: n touching
 *  proportional rules, each with its count and label underneath.
 *
 *  Categorical mixes are never pies (01 § Data-viz). The mix reads
 *  `primary` → `accent` → neutral, in the order the caller passes; a member
 *  that carries a status meaning takes the fixed semantic set instead. The
 *  shares, the floor for narrow members and the one-segment/empty degradations
 *  all live in `segmentedBarView`, which is where they are tested.
 *
 *  Not a card: it renders inside one, under the section heading its call site
 *  owns. */
@Component({
  selector: 'app-segmented-bar',
  templateUrl: './segmented-bar.html',
  host: { class: 'block' },
})
export class SegmentedBar {
  segments = input.required<BarSegment[]>();
  loading = input(false);
  emptyLabel = input('Sin datos en el periodo.');

  protected readonly view = computed(() => segmentedBarView(this.segments()));
  protected readonly isEmpty = computed(() => this.view().length === 0);

  protected readonly skeletonColumns = [0, 1, 2];
}
