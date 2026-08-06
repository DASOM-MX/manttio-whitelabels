import { Component, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Actions, Store, ofActionErrored, ofActionSuccessful, select } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { AppState } from '../../../../state/app/app.state';
import { QueueVisitAction } from '../../../../state/pending-visit-actions/pending-visit-actions.actions';
import { PendingVisitActionType } from '../../../../offline/pending-visit-action.model';
import { VISIT_CLOSE_REASON_LABELS } from '../../../data/constants';
import { VisitCloseReason } from '../../../data/types/visit';
import type { Visit } from '../../../data/dtos/visit';

@Component({
  selector: 'app-close-visit-dialog',
  standalone: true,
  imports: [ReactiveFormsModule, DialogModule, SelectModule, TextareaModule],
  templateUrl: './close-visit-dialog.html',
})
export class CloseVisitDialog {
  /** The dialog toasts and closes itself; this lets the page react (navigate
   *  back to the list, refetch) once the tap is queued. */
  readonly closedVisit = output<Visit>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);

  dialogOpen = signal(false);
  target = signal<Visit | null>(null);
  submitting = signal(false);

  private isOnline = select(AppState.isOnline);

  /** Built from the label map so the wording lives in exactly one place. */
  readonly reasonOptions = Object.entries(VISIT_CLOSE_REASON_LABELS).map(([value, label]) => ({
    label,
    value: value as VisitCloseReason,
  }));

  form = this.fb.group({
    reason: [null as VisitCloseReason | null, Validators.required],
    note: [''],
  });

  private reasonValue = toSignal(this.form.controls.reason.valueChanges, {
    initialValue: this.form.controls.reason.value,
  });
  private noteValue = toSignal(this.form.controls.note.valueChanges, {
    initialValue: this.form.controls.note.value,
  });

  /** `other` is the escape hatch, so it has to carry its own explanation — the
   *  backend rejects it without a note. */
  noteRequired = computed(() => this.reasonValue() === VisitCloseReason.Other);

  canConfirm = computed(() => {
    if (this.submitting() || !this.reasonValue()) return false;
    return !this.noteRequired() || (this.noteValue() ?? '').trim().length > 0;
  });

  constructor() {
    this.actions$
      .pipe(ofActionSuccessful(QueueVisitAction), takeUntilDestroyed())
      .subscribe(() => {
        // Iniciar/Terminar dispatch the same action from the detail page —
        // only react to the one this dialog sent.
        if (!this.submitting()) return;
        const visit = this.target();
        this.submitting.set(false);
        this.close();
        this.messages.add({
          severity: 'success',
          summary: 'Visita cerrada',
          detail: this.isOnline()
            ? undefined
            : 'Se enviará cuando el dispositivo recupere conexión.',
        });
        if (visit) this.closedVisit.emit(visit);
      });

    this.actions$
      .pipe(ofActionErrored(QueueVisitAction), takeUntilDestroyed())
      .subscribe(() => {
        if (!this.submitting()) return;
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo registrar el cierre',
        });
      });
  }

  open(target: Visit): void {
    this.target.set(target);
    this.form.reset({ reason: null, note: '' });
    this.dialogOpen.set(true);
  }

  cancel(): void {
    if (this.submitting()) return;
    this.close();
  }

  confirm(): void {
    const target = this.target();
    const reason = this.form.controls.reason.value;
    if (!target || !reason || !this.canConfirm()) return;
    const note = (this.form.controls.note.value ?? '').trim();
    this.submitting.set(true);
    this.store.dispatch(
      new QueueVisitAction(target, PendingVisitActionType.Close, {
        reason,
        ...(note ? { note } : {}),
      }),
    );
  }

  private close(): void {
    this.dialogOpen.set(false);
    this.target.set(null);
    this.form.reset({ reason: null, note: '' });
  }
}
