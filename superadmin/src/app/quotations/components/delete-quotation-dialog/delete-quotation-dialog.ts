import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { Store } from '@ngxs/store';
import { DeleteQuotation } from '../../../../state/quotations/quotations.actions';
import { errorMessage } from '../../../data/utils';
import type { QuotationDetail } from '../../../data/dtos/quotation/quotation';

/** Audited soft delete — admin tier, same contract as users/services/equipment.
 *
 *  Housekeeping rather than a lifecycle step, which is why it is allowed from
 *  any state and why office keeps `/cancel` but not this: cancelling retires a
 *  quote the client may still be shown, deleting takes it out of the tenant's
 *  own lists. Nothing is destroyed — the row and its whole timeline survive,
 *  every read path filters them out, and the mailed links stop resolving. */
@Component({
  selector: 'app-delete-quotation-dialog',
  imports: [ReactiveFormsModule, DialogModule, TextareaModule],
  templateUrl: './delete-quotation-dialog.html',
})
export class DeleteQuotationDialog {
  readonly deleted = output<string>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected target = signal<QuotationDetail | null>(null);
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

  open(target: QuotationDetail): void {
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
        new DeleteQuotation(target.id, {
          deleteComment: this.form.getRawValue().comment.trim(),
        }),
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Cotización eliminada' });
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
