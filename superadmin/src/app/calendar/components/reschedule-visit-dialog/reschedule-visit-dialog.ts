import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, of } from 'rxjs';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import { Store } from '@ngxs/store';
import { RescheduleVisit } from '../../../../state/visits/visits.actions';
import { UsersService } from '../../../services/http/users.service';
import { errorMessage } from '../../../data/utils';
import type { AssignableUser } from '../../../data/dtos/user';
import type { Visit } from '../../../data/dtos/visit';

/** The successor of a closed visit (12 §1): a NEW `scheduled` record chained
 *  through `rescheduledFromId` — the closed one is never edited. Same order,
 *  client, title and notes; new date/time; technician defaults to the closed
 *  visit's and is overridable (or cleared back to the backlog). */
@Component({
  selector: 'app-reschedule-visit-dialog',
  imports: [ReactiveFormsModule, DialogModule, DatePickerModule, SelectModule],
  templateUrl: './reschedule-visit-dialog.html',
})
export class RescheduleVisitDialog {
  /** The successor exists — the calendar reloads its week. */
  readonly rescheduled = output<void>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected target = signal<Visit | null>(null);
  protected submitting = signal(false);

  protected form = this.fb.group({
    fecha: this.fb.control<Date | null>(null, Validators.required),
    horaInicio: this.fb.control<Date | null>(null, Validators.required),
    horaFin: this.fb.control<Date | null>(null),
    technicianId: this.fb.nonNullable.control(''),
  });

  protected technicians = toSignal(
    inject(UsersService)
      .listAssignable()
      .pipe(catchError(() => of([] as AssignableUser[]))),
    { initialValue: [] as AssignableUser[] },
  );

  protected technicianOptions = computed(() => [
    { label: 'Sin asignar', value: '' },
    ...this.technicians().map((user) => ({ label: user.fullName, value: user.id })),
  ]);

  private formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  protected canConfirm = computed(() => this.formStatus() === 'VALID' && !this.submitting());

  /** Pre-fills from the closed visit: same time-of-day, its technician —
   *  the date is the one thing that always changes, so it starts empty. */
  open(target: Visit): void {
    this.target.set(target);
    const start = new Date(target.scheduledStart);
    this.form.reset({
      fecha: null,
      horaInicio: start,
      horaFin: target.scheduledEnd ? new Date(target.scheduledEnd) : null,
      technicianId: target.technicianId ?? '',
    });
    this.submitting.set(false);
    this.dialogOpen.set(true);
  }

  protected close(): void {
    if (this.submitting()) return;
    this.dialogOpen.set(false);
  }

  protected confirm(): void {
    const target = this.target();
    const raw = this.form.getRawValue();
    if (!target || !raw.fecha || !raw.horaInicio || !this.canConfirm()) return;
    this.submitting.set(true);
    this.store
      .dispatch(
        new RescheduleVisit(target.id, {
          scheduledStart: atTime(raw.fecha, raw.horaInicio).toISOString(),
          scheduledEnd: raw.horaFin ? atTime(raw.fecha, raw.horaFin).toISOString() : undefined,
          technicianId: raw.technicianId || null,
        }),
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Visita reprogramada' });
          this.rescheduled.emit();
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo reprogramar',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}

/** Local-field date+time composition — never millisecond math. */
const atTime = (date: Date, time: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes());
