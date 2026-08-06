import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Actions, Store, ofActionErrored, ofActionSuccessful, select } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { TagModule } from 'primeng/tag';
import { AppState } from '../../../../state/app/app.state';
import { VisitsState } from '../../../../state/visits/visits.state';
import { LoadVisit } from '../../../../state/visits/visits.actions';
import { PendingVisitActionsState } from '../../../../state/pending-visit-actions/pending-visit-actions.state';
import { QueueVisitAction } from '../../../../state/pending-visit-actions/pending-visit-actions.actions';
import { PendingVisitActionType } from '../../../../offline/pending-visit-action.model';
import { VisitDayPipe } from '../../../pipes/visit-day.pipe';
import { VisitTimePipe } from '../../../pipes/visit-time.pipe';
import {
  VISIT_CLOSE_REASON_LABELS,
  VISIT_STATUS_LABELS,
  VISIT_STATUS_SEVERITIES,
} from '../../../data/constants';
import { toVisitVM } from '../../visit-vm';
import { CloseVisitDialog } from '../../components/close-visit-dialog/close-visit-dialog';

@Component({
  selector: 'app-visit-detail',
  standalone: true,
  imports: [TagModule, VisitDayPipe, VisitTimePipe, CloseVisitDialog],
  templateUrl: './visit-detail.html',
})
export class VisitDetail {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);

  private closeDialog = viewChild<CloseVisitDialog>('closeDialog');

  readonly statusLabels = VISIT_STATUS_LABELS;
  readonly statusSeverities = VISIT_STATUS_SEVERITIES;
  readonly closeReasonLabels = VISIT_CLOSE_REASON_LABELS;

  /** Which tap this page is waiting on — also the guard that keeps it from
   *  reacting to the close dialog's own dispatch. */
  private submitting = signal<PendingVisitActionType | null>(null);

  isOnline = select(AppState.isOnline);
  private visit = select(VisitsState.selected);
  private pendingTaps = select(PendingVisitActionsState.pending);

  private visitId = signal<string | null>(null);

  vm = computed(() => {
    const visit = this.visit();
    if (!visit || visit.id !== this.visitId()) return null;
    const mine = this.pendingTaps().filter((p) => p.visitId === visit.id);
    return toVisitVM(visit, mine);
  });

  /** Planned vs actual, the payoff of stamping tap times (12 CP-1b). */
  overrunMinutes = computed(() => {
    const vm = this.vm();
    const actual = vm?.visit.actualDurationMinutes;
    if (!vm || actual === undefined) return null;
    return actual - vm.visit.expectedDurationMinutes;
  });

  busy = computed(() => this.submitting() !== null);

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id');
      if (!id) return;
      this.visitId.set(id);
      this.store.dispatch(new LoadVisit(id));
    });

    this.actions$
      .pipe(ofActionSuccessful(QueueVisitAction), takeUntilDestroyed())
      .subscribe(() => {
        const action = this.submitting();
        if (!action) return;
        this.submitting.set(null);
        this.messages.add({
          severity: 'success',
          summary:
            action === PendingVisitActionType.Start ? 'Visita iniciada' : 'Visita terminada',
          detail: this.isOnline()
            ? undefined
            : 'Se enviará cuando el dispositivo recupere conexión.',
        });
      });

    this.actions$
      .pipe(ofActionErrored(QueueVisitAction), takeUntilDestroyed())
      .subscribe(() => {
        if (!this.submitting()) return;
        this.submitting.set(null);
        this.messages.add({ severity: 'error', summary: 'No se pudo registrar la acción' });
      });
  }

  start(): void {
    this.queue(PendingVisitActionType.Start);
  }

  respond(): void {
    this.queue(PendingVisitActionType.Respond);
  }

  private queue(action: PendingVisitActionType): void {
    const vm = this.vm();
    if (!vm || this.busy()) return;
    this.submitting.set(action);
    this.store.dispatch(new QueueVisitAction(vm.visit, action));
  }

  openCloseDialog(): void {
    const vm = this.vm();
    if (!vm || this.busy()) return;
    this.closeDialog()?.open(vm.visit);
  }

  back(): void {
    this.router.navigate(['/visits']);
  }

  /** "1 h 30 min" — minutes alone stop reading as a duration past an hour. */
  formatDuration(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (!h) return `${m} min`;
    return m ? `${h} h ${m} min` : `${h} h`;
  }

  /** The address is user-entered, so it has to be escaped before it goes into
   *  the Maps query string. */
  encode(value: string): string {
    return encodeURIComponent(value);
  }
}
