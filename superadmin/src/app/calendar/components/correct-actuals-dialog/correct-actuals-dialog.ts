import { Component, computed, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { Store } from '@ngxs/store';
import { CorrectVisitActuals } from '../../../../state/visits/visits.actions';
import { errorMessage, formatDurationMinutes } from '../../../data/utils';
import type { CorrectVisitActualsRequest, Visit } from '../../../data/dtos/visit';

/** Fixing what a technician recorded (12 §2, owner/admin only). This is the one
 *  edit that reaches past a terminal state, and it exists because a mis-tapped
 *  Iniciar — or a stamp mangled by an offline sync — would otherwise bill wrong
 *  forever.
 *
 *  Two rules shape the form. It **repairs a time, it never erases one**: neither
 *  field is clearable, matching an API that takes no nulls here. And it shows
 *  the recomputed length *before* saving, because the length is what the
 *  correction is really about — nobody edits a timestamp for its own sake. */
@Component({
  selector: 'app-correct-actuals-dialog',
  imports: [ReactiveFormsModule, DialogModule, DatePickerModule],
  templateUrl: './correct-actuals-dialog.html',
})
export class CorrectActualsDialog {
  /** The stamps changed — the calendar reloads its window. */
  readonly corrected = output<void>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected target = signal<Visit | null>(null);
  protected submitting = signal(false);

  protected form = this.fb.group({
    inicio: this.fb.control<Date | null>(null),
    fin: this.fb.control<Date | null>(null),
  });

  private formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });

  /** Minutes between the two stamps as currently typed — negative when the pair
   *  is incoherent, which is exactly what the warning below keys on. */
  private previewMinutes = computed(() => {
    const { inicio, fin } = this.formValue();
    if (!inicio || !fin) return null;
    return Math.round((fin.getTime() - inicio.getTime()) / 60_000);
  });

  protected previewDuration = computed(() => {
    const minutes = this.previewMinutes();
    return minutes === null || minutes < 0 ? null : formatDurationMinutes(minutes);
  });

  /** An end before its start is not a correction, it is a second mistake. */
  protected incoherent = computed(() => (this.previewMinutes() ?? 0) < 0);

  protected canConfirm = computed(() => !this.submitting() && !this.incoherent());

  /** Pre-filled with whatever is on record — including nothing, which is a real
   *  case: a sync that dropped both stamps leaves a completed visit with no
   *  times at all, and this is where they get entered. */
  open(visit: Visit): void {
    this.target.set(visit);
    this.form.reset({
      inicio: visit.actualStart ? new Date(visit.actualStart) : null,
      fin: visit.actualEnd ? new Date(visit.actualEnd) : null,
    });
    this.submitting.set(false);
    this.dialogOpen.set(true);
  }

  protected close(): void {
    if (this.submitting()) return;
    this.dialogOpen.set(false);
  }

  protected confirm(): void {
    const visit = this.target();
    if (!visit || !this.canConfirm()) return;
    const { inicio, fin } = this.form.getRawValue();

    // Only what actually moved: the endpoint takes a partial, and sending an
    // unchanged stamp back would append a correction event that corrected
    // nothing — noise in the very trail this edit is audited by.
    const payload: CorrectVisitActualsRequest = {};
    const start = inicio?.toISOString();
    if (start && start !== visit.actualStart) payload.actualStart = start;
    const end = fin?.toISOString();
    if (end && end !== visit.actualEnd) payload.actualEnd = end;

    if (!Object.keys(payload).length) {
      this.dialogOpen.set(false);
      return;
    }

    this.submitting.set(true);
    this.store.dispatch(new CorrectVisitActuals(visit.id, payload)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.dialogOpen.set(false);
        this.messages.add({ severity: 'success', summary: 'Tiempos corregidos' });
        this.corrected.emit();
      },
      error: (err) => {
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudieron corregir',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }
}
