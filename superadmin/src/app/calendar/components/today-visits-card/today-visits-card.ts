import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { select, Store } from '@ngxs/store';
import { VisitsState } from '../../../../state/visits/visits.state';
import {
  ListenVisits,
  LoadVisits,
  StopListeningVisits,
} from '../../../../state/visits/visits.actions';
import { VisitsService } from '../../../services/http/visits.service';
import { VisitStatusLabelPipe, VisitStatusSeverityPipe } from '../../../pipes/visit.pipe';
import { VisitStatus } from '../../../model/enums/visit/visit-status.enum';
import { tableLoading } from '../../../services/table/table-loading';

/** Dashboard "Visitas de hoy" (12 CP-4b): today's schedule at a glance, live.
 *  It rides the SAME state machinery as the calendar page — LoadVisits for
 *  today's window plus ListenVisits — so a technician's Iniciar moves the row
 *  while office watches the dashboard, exactly like the calendar. Safe to
 *  share: dashboard and calendar are different routes, never mounted together.
 *
 *  The footer is the estimate-accuracy read — the first payoff of the actuals
 *  (12 §4): completed visits measured over the last month, average signed
 *  variance vs plan. It reads the API directly (the dialog's pattern for
 *  page-scoped data) because routing it through VisitsState would clobber the
 *  today window this same card renders. */
@Component({
  selector: 'app-today-visits-card',
  imports: [
    DatePipe,
    RouterLink,
    TableModule,
    TagModule,
    VisitStatusLabelPipe,
    VisitStatusSeverityPipe,
  ],
  templateUrl: './today-visits-card.html',
  host: { class: 'block' },
})
export class TodayVisitsCard {
  private store = inject(Store);
  private router = inject(Router);
  private visitsApi = inject(VisitsService);

  /** How far back the plan-vs-actual read looks. A month is enough signal to
   *  read the estimate habit without freezing the number in old history. */
  private readonly accuracyWindowDays = 30;

  private items = select(VisitsState.items);
  protected loading = select(VisitsState.loading);

  protected readonly skeletonRows = [0, 1, 2];

  protected rows = computed(() =>
    [...this.items()].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
  );

  protected tableBusy = tableLoading(this.loading, this.rows);

  private accuracy = signal<{ count: number; avg: number } | null>(null);

  protected accuracyLabel = computed(() => {
    const acc = this.accuracy();
    if (!acc) return '';
    if (!acc.count) return `Plan vs real (${this.accuracyWindowDays} días): sin visitas medidas.`;
    const sign = acc.avg > 0 ? '+' : '';
    return (
      `Plan vs real (${this.accuracyWindowDays} días): ${sign}${acc.avg} min vs plan en ` +
      `promedio · ${acc.count} ${acc.count === 1 ? 'visita medida' : 'visitas medidas'}`
    );
  });

  constructor() {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date();
    to.setHours(23, 59, 59, 999);
    this.store.dispatch(new LoadVisits({ from: from.toISOString(), to: to.toISOString() }));
    this.store.dispatch(new ListenVisits());
    inject(DestroyRef).onDestroy(() => this.store.dispatch(new StopListeningVisits()));

    const accFrom = new Date(from);
    accFrom.setDate(accFrom.getDate() - this.accuracyWindowDays);
    this.visitsApi
      .list({ from: accFrom.toISOString(), to: to.toISOString(), status: VisitStatus.Completed })
      .subscribe({
        next: (visits) => {
          const deltas = visits
            .map((visit) =>
              visit.actualDurationMinutes === undefined
                ? null
                : visit.actualDurationMinutes - visit.expectedDurationMinutes,
            )
            .filter((delta): delta is number => delta !== null);
          this.accuracy.set({
            count: deltas.length,
            avg: deltas.length
              ? Math.round(deltas.reduce((sum, delta) => sum + delta, 0) / deltas.length)
              : 0,
          });
        },
        // A failed read hides the footer — the schedule above is the payload.
        error: () => this.accuracy.set(null),
      });
  }

  protected openCalendar(): void {
    this.router.navigate(['/calendar'], { queryParams: { view: 'day' } });
  }
}
