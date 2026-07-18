import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { Store } from '@ngxs/store';
import { ChangeCustomerStatus } from '../../../../state/customers/customers.actions';
import { STATUS_TRANSITIONS } from '../../../model/constants/customer/status-transitions.const';
import { CUSTOMER_STATUS_LABELS } from '../../../model/constants/customer/customer-status-labels.const';
import { errorMessage } from '../../../data/utils';
import { CustomerStatus } from '../../../data/dtos/customer';
import type { Customer } from '../../../data/dtos/customer';

/** Status-change dialog (08 §1, shape 3): only legal transitions offered;
 *  reason required when the target is `blacklisted`; optional note otherwise;
 *  optional follow-up date (natural moment — 08 §3). The backend emits the
 *  system timeline entry. */
@Component({
  selector: 'app-change-status-dialog',
  imports: [ReactiveFormsModule, DialogModule, SelectModule, DatePickerModule, TextareaModule],
  templateUrl: './change-status-dialog.html',
})
export class ChangeStatusDialog {
  /** Emits after a successful transition (parents refresh/reload timeline). */
  readonly changed = output<void>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected target = signal<Customer | null>(null);
  protected submitting = signal(false);

  protected form = this.fb.nonNullable.group({
    status: ['' as CustomerStatus | '', Validators.required],
    reason: [''],
    nextFollowUpAt: [null as Date | null],
  });

  private statusValue = toSignal(this.form.controls.status.valueChanges, {
    initialValue: this.form.controls.status.value,
  });
  private reasonValue = toSignal(this.form.controls.reason.valueChanges, {
    initialValue: this.form.controls.reason.value,
  });

  protected isBlacklistTarget = computed(() => this.statusValue() === CustomerStatus.Blacklisted);

  protected canConfirm = computed(() => {
    if (this.submitting() || !this.statusValue()) return false;
    if (this.isBlacklistTarget()) return !!(this.reasonValue() ?? '').trim();
    return true;
  });

  /** Legal targets for the current status (08 §1). */
  protected options = computed(() => {
    const current = this.target()?.status;
    if (!current) return [];
    return STATUS_TRANSITIONS[current].map((value) => ({
      value,
      label: CUSTOMER_STATUS_LABELS[value],
    }));
  });

  open(customer: Customer, preset?: CustomerStatus): void {
    this.target.set(customer);
    this.form.reset({ status: preset ?? '', reason: '', nextFollowUpAt: null });
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
    if (!target || !raw.status || !this.canConfirm()) return;
    this.submitting.set(true);
    this.store
      .dispatch(
        new ChangeCustomerStatus(target.id, {
          status: raw.status,
          reason: raw.reason.trim() || undefined,
          nextFollowUpAt: raw.nextFollowUpAt
            ? raw.nextFollowUpAt.toISOString().slice(0, 10)
            : undefined,
        }),
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Estado actualizado' });
          this.changed.emit();
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo cambiar el estado',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}
