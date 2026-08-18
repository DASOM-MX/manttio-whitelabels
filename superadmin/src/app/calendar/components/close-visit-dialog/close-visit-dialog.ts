import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Store } from '@ngxs/store';
import { CloseVisit } from '../../../../state/visits/visits.actions';
import { VISIT_CLOSE_REASON_LABELS } from '../../../model/constants/visit/visit-close-reason-labels.const';
import { VisitCloseReason } from '../../../model/enums/visit/visit-close-reason.enum';
import { errorMessage } from '../../../data/utils';
import type { Visit } from '../../../data/dtos/visit';

/** The categorized close (12 §4): reason required, note optional — except on
 *  `other`, where the escape hatch must carry its own explanation. On success
 *  the reschedule-now/later prompt follows (12 §1: closing is terminal; the
 *  replacement is a NEW linked record, minted now or whenever staff return). */
@Component({
  selector: 'app-close-visit-dialog',
  imports: [ReactiveFormsModule, DialogModule, SelectModule, TextareaModule],
  templateUrl: './close-visit-dialog.html',
})
export class CloseVisitDialog {
  /** The close landed (emitted before the reschedule prompt resolves). */
  readonly changed = output<void>();
  /** "Reprogramar ahora" — the parent opens the successor dialog. */
  readonly rescheduleRequested = output<Visit>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);

  protected dialogOpen = signal(false);
  protected target = signal<Visit | null>(null);
  protected submitting = signal(false);

  protected form = this.fb.nonNullable.group({
    reason: this.fb.nonNullable.control<VisitCloseReason | ''>('', Validators.required),
    note: [''],
  });

  protected readonly reasonOptions = (
    Object.entries(VISIT_CLOSE_REASON_LABELS) as [VisitCloseReason, string][]
  ).map(([value, label]) => ({ value, label }));

  private reasonValue = toSignal(this.form.controls.reason.valueChanges, {
    initialValue: this.form.controls.reason.value,
  });
  private noteValue = toSignal(this.form.controls.note.valueChanges, {
    initialValue: this.form.controls.note.value,
  });

  /** `other` without a note would tell the client handoff nothing. */
  protected noteRequired = computed(() => this.reasonValue() === VisitCloseReason.Other);

  protected canConfirm = computed(() => {
    if (this.submitting()) return false;
    const reason = this.reasonValue();
    if (!reason) return false;
    return reason !== VisitCloseReason.Other || this.noteValue().trim().length > 0;
  });

  open(target: Visit): void {
    this.target.set(target);
    this.form.reset({ reason: '', note: '' });
    this.submitting.set(false);
    this.dialogOpen.set(true);
  }

  protected close(): void {
    if (this.submitting()) return;
    this.dialogOpen.set(false);
  }

  protected confirm(): void {
    const target = this.target();
    const reason = this.reasonValue();
    if (!target || !reason || !this.canConfirm()) return;
    const note = this.form.getRawValue().note.trim();
    this.submitting.set(true);
    this.store.dispatch(new CloseVisit(target.id, { reason, note: note || undefined })).subscribe({
      next: () => {
        this.submitting.set(false);
        this.dialogOpen.set(false);
        this.messages.add({ severity: 'success', summary: 'Visita cerrada' });
        this.changed.emit();
        this.promptReschedule(target);
      },
      error: (err) => {
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo cerrar',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  /** Now or later (12 §1) — "later" just means the successor gets minted
   *  whenever someone reopens the closed visit and reschedules from there. */
  private promptReschedule(target: Visit): void {
    this.confirmation.confirm({
      header: 'Reprogramar',
      message: 'La visita quedó cerrada. ¿Quieres programar su reemplazo ahora?',
      acceptLabel: 'Reprogramar ahora',
      rejectLabel: 'Después',
      acceptButtonStyleClass: 'btn-primary',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => this.rescheduleRequested.emit(target),
    });
  }
}
