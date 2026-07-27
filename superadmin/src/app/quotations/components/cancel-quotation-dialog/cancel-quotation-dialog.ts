import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { Store } from '@ngxs/store';
import { CancelQuotation } from '../../../../state/quotations/quotations.actions';
import { errorMessage } from '../../../data/utils';
import type { QuotationDetail } from '../../../data/dtos/quotation/quotation';

/** Explicit staff abandonment (20 §2) — terminal, with a mandatory comment that
 *  becomes the quote's `resolutionReason`.
 *
 *  Distinct from a client's `declined`, which is not an ending: a declined quote
 *  stays live and can still be revised or converted. This is the tenant closing
 *  the file. */
@Component({
  selector: 'app-cancel-quotation-dialog',
  imports: [ReactiveFormsModule, DialogModule, TextareaModule],
  templateUrl: './cancel-quotation-dialog.html',
})
export class CancelQuotationDialog {
  readonly cancelled = output<void>();

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
      .dispatch(new CancelQuotation(target.id, { comment: this.form.getRawValue().comment.trim() }))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Cotización cancelada' });
          this.cancelled.emit();
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo cancelar',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}
