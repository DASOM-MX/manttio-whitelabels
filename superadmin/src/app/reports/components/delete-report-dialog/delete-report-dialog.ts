import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { DeleteReport } from '../../../../state/reports/reports.actions';
import { errorMessage } from '../../../data/utils';
import type { ReportSummary } from '../../../data/dtos/report';

/** Shape-3 delete dialog with required audit comment (06 §3) — follows the
 *  05 delete-dialog pattern; a shared base stays an open coordination ask. */
@Component({
  selector: 'app-delete-report-dialog',
  imports: [ReactiveFormsModule, DialogModule, TextareaModule],
  templateUrl: './delete-report-dialog.html',
})
export class DeleteReportDialog {
  readonly deleted = output<string>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected target = signal<ReportSummary | null>(null);
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

  open(target: ReportSummary): void {
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
      .dispatch(new DeleteReport(target.id, { deleteComment: this.form.value.comment.trim() }))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Reporte eliminado' });
          this.deleted.emit(target.id);
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo eliminar el reporte',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}
