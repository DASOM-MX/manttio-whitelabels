import { Component, input, output } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { VisitTimePipe } from '../../../pipes/visit-time.pipe';
import { VISIT_STATUS_LABELS, VISIT_STATUS_SEVERITIES } from '../../../data/constants';
import type { VisitVM } from '../../visit-vm';

/** One visit row on the "Mis visitas" phone list. Presentational — the page
 *  owns navigation, so the card only reports the tap. The day never appears
 *  here: every section heading (hoy, mañana, the week's day subheads) already
 *  says it. */
@Component({
  selector: 'app-visit-card',
  standalone: true,
  imports: [TagModule, VisitTimePipe],
  templateUrl: './visit-card.html',
})
export class VisitCard {
  vm = input.required<VisitVM>();
  readonly open = output<string>();

  readonly statusLabels = VISIT_STATUS_LABELS;
  readonly statusSeverities = VISIT_STATUS_SEVERITIES;
}
