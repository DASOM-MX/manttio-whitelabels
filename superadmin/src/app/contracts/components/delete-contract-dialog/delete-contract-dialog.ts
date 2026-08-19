import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { Store } from '@ngxs/store';
import { DeleteContract } from '../../../../state/contracts/contracts.actions';
import { errorMessage } from '../../../data/utils';
import type { Contract } from '../../../data/dtos/contract/contract';

/** Audited soft delete — owner/admin only (13 §4), same contract as
 *  users/services/equipment/quotations.
 *
 *  This is also how **early termination** is recorded: there is no `cancelled`
 *  state on a contract, so ending one before its expiry is a delete with the
 *  reason written down. Nothing is destroyed — the row, its document and its
 *  whole timeline survive; every read path filters them out. */
@Component({
  selector: 'app-delete-contract-dialog',
  imports: [ReactiveFormsModule, DialogModule, TextareaModule],
  templateUrl: './delete-contract-dialog.html',
})
export class DeleteContractDialog {
  readonly deleted = output<string>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected target = signal<Contract | null>(null);
  protected submitting = signal(false);

  protected form = this.fb.nonNullable.group({
    comment: ['', Validators.required],
  });

  private commentValue = toSignal(this.form.controls.comment.valueChanges, {
    initialValue: this.form.controls.comment.value,
  });

  protected canConfirm = computed(
    () => this.commentValue().trim().length > 0 && !this.submitting(),
  );

  open(target: Contract): void {
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
      .dispatch(
        new DeleteContract(target.id, {
          deleteComment: this.form.getRawValue().comment.trim(),
        }),
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Contrato eliminado' });
          this.deleted.emit(target.id);
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo eliminar',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}
