import { Component, computed, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { select, Store } from '@ngxs/store';
import { CreateEquipment, UpdateEquipment } from '../../../../state/equipment/equipment.actions';
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomers } from '../../../../state/customers/customers.actions';
import { errorMessage } from '../../../data/utils';
import type { Equipment } from '../../../data/dtos/equipment';

/** Shape-3 create/edit dialog (11 §4) — openable from the global list and
 *  from the customer-view card with the client pre-locked. */
@Component({
  selector: 'app-equipment-form-dialog',
  imports: [
    ReactiveFormsModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    CheckboxModule,
    TextareaModule,
  ],
  templateUrl: './equipment-form-dialog.html',
})
export class EquipmentFormDialog {
  /** Emits after create/update so parents refresh their lists. */
  readonly saved = output<void>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected submitting = signal(false);
  protected editing = signal<Equipment | null>(null);
  /** Set when opened from a customer view — client select locked. */
  protected lockedCustomerId = signal<string | null>(null);

  private customers = select(CustomersState.items);

  protected customerOptions = computed(() =>
    this.customers().map((c) => ({ label: c.name, value: c.id })),
  );

  protected form = this.fb.nonNullable.group({
    customerId: ['', Validators.required],
    name: [''],
    kind: [''],
    brand: [''],
    model: [''],
    serialNumber: [''],
    capacity: [''],
    location: [''],
    installDate: [''],
    installedByUs: [false],
    notes: [''],
  });

  open(options?: { customerId?: string; equipment?: Equipment }): void {
    const eq = options?.equipment ?? null;
    this.editing.set(eq);
    this.lockedCustomerId.set(options?.customerId ?? null);
    // Options pool for the client select when unlocked.
    if (!options?.customerId && !this.customers().length) {
      this.store.dispatch(new LoadCustomers({ page: 1, limit: 100 }));
    }
    this.form.reset({
      customerId: options?.customerId ?? eq?.customerId ?? '',
      name: eq?.name ?? '',
      kind: eq?.kind ?? '',
      brand: eq?.brand ?? '',
      model: eq?.model ?? '',
      serialNumber: eq?.serialNumber ?? '',
      capacity: eq?.capacity ?? '',
      location: eq?.location ?? '',
      installDate: eq?.installDate ?? '',
      installedByUs: eq?.installedByUs ?? false,
      notes: eq?.notes ?? '',
    });
    if (this.lockedCustomerId()) this.form.controls.customerId.disable({ emitEvent: false });
    else this.form.controls.customerId.enable({ emitEvent: false });
    this.submitting.set(false);
    this.dialogOpen.set(true);
  }

  protected close(): void {
    if (this.submitting()) return;
    this.dialogOpen.set(false);
  }

  protected submit(): void {
    if (this.form.invalid || this.submitting()) return;
    const raw = this.form.getRawValue();
    const payload = {
      customerId: raw.customerId,
      name: raw.name || undefined,
      kind: raw.kind || undefined,
      brand: raw.brand || undefined,
      model: raw.model || undefined,
      serialNumber: raw.serialNumber || undefined,
      capacity: raw.capacity || undefined,
      location: raw.location || undefined,
      installDate: raw.installDate || undefined,
      installedByUs: raw.installedByUs,
      notes: raw.notes || undefined,
    };
    const editing = this.editing();
    this.submitting.set(true);
    this.store
      .dispatch(editing ? new UpdateEquipment(editing.id, payload) : new CreateEquipment(payload))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({
            severity: 'success',
            summary: editing ? 'Equipo actualizado' : 'Equipo registrado',
          });
          this.saved.emit();
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo guardar el equipo',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}
