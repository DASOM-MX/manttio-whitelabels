import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { DeleteCustomer } from '../../../../state/customers/customers.actions';
import { errorMessage } from '../../../data/utils';
import type { Customer } from '../../../data/dtos/customer';

/** Shape-3 delete dialog with required audit comment (07 §3). */
@Component({
  selector: 'app-delete-customer-dialog',
  imports: [ReactiveFormsModule, DialogModule, TextareaModule],
  templateUrl: './delete-customer-dialog.html',
})
export class DeleteCustomerDialog {
  readonly deleted = output<string>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected target = signal<Customer | null>(null);
  protected submitting = signal(false);

  protected form: FormGroup = this.fb.group({
    comment: ['', [Validators.required]],
  });

  private commentValue = toSignal(this.form.controls['comment'].valueChanges, {
    initialValue: this.form.controls['comment'].value as string,
  });

  protected canConfirm = computed(() => {
    const c = this.commentValue();
    return typeof c === 'string' && c.trim().length > 0 && !this.submitting();
  });

  open(target: Customer): void {
    this.target.set(target);
    this.form.reset({ comment: '' });
    this.submitting.set(false);
    this.dialogOpen.set(true);
  }

  protected close(): void {
    if (this.submitting()) return;
    this.dialogOpen.set(false);
  }

  protected confirm(): void {
    const target = this.target();
    if (!target || !this.canConfirm()) return;
    this.submitting.set(true);
    this.store
      .dispatch(new DeleteCustomer(target.id, { deleteComment: this.form.value.comment.trim() }))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Cliente eliminado' });
          this.deleted.emit(target.id);
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo eliminar el cliente',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}
