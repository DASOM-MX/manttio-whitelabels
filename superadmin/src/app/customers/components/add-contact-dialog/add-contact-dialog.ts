import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { AddCustomerContact } from '../../../../state/customers/customers.actions';
import { errorMessage } from '../../../data/utils';
import type { Customer, CustomerContact } from '../../../data/dtos/customer';

/** In-view "add contact" dialog (shape-3): owns the form + dispatch + toast, so
 *  users can append a contact from the client's Contactos tab without opening
 *  the full edit form. Backend replaces contacts wholesale, so we send the
 *  existing list plus the new entry. */
@Component({
  selector: 'app-add-contact-dialog',
  imports: [ReactiveFormsModule, DialogModule, InputTextModule],
  templateUrl: './add-contact-dialog.html',
})
export class AddContactDialog {
  readonly added = output<void>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected target = signal<Customer | null>(null);
  protected submitting = signal(false);

  protected form = this.fb.group({
    name: ['', [Validators.required]],
    role: [''],
    phone: [''],
    email: ['', [Validators.email]],
  });

  private status = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  protected canSubmit = computed(() => this.status() === 'VALID' && !this.submitting());

  open(customer: Customer): void {
    this.target.set(customer);
    this.form.reset({ name: '', role: '', phone: '', email: '' });
    this.submitting.set(false);
    this.dialogOpen.set(true);
  }

  protected close(): void {
    if (this.submitting()) return;
    this.dialogOpen.set(false);
  }

  protected submit(): void {
    const target = this.target();
    if (!target || !this.canSubmit()) return;

    const v = this.form.getRawValue();
    const contact: CustomerContact = { name: v.name!.trim() };
    if (v.role?.trim()) contact.role = v.role.trim();
    if (v.phone?.trim()) contact.phone = v.phone.trim();
    if (v.email?.trim()) contact.email = v.email.trim();

    this.submitting.set(true);
    this.store.dispatch(new AddCustomerContact(target.id, contact)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.dialogOpen.set(false);
        this.messages.add({ severity: 'success', summary: 'Contacto agregado' });
        this.added.emit();
      },
      error: (err) => {
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo agregar el contacto',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }
}
