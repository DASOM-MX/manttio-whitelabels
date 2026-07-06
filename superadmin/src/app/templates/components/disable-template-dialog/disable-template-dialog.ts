import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { DisableTemplate } from '../../../../state/report-templates/report-templates.actions';
import { errorMessage } from '../../../data/utils';
import type { ReportTemplate } from '../../../data/dtos/report-template';

/** Disable is terminal (06 §5.2) and requires an audited reason — mirrors
 *  the delete-dialog pattern (shape 3). */
@Component({
  selector: 'app-disable-template-dialog',
  imports: [ReactiveFormsModule, DialogModule, TextareaModule],
  templateUrl: './disable-template-dialog.html',
})
export class DisableTemplateDialog {
  readonly disabled = output<void>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected target = signal<ReportTemplate | null>(null);
  protected submitting = signal(false);

  protected form: FormGroup = this.fb.group({
    reason: ['', [Validators.required]],
  });

  private reasonValue = toSignal(this.form.controls['reason'].valueChanges, {
    initialValue: this.form.controls['reason'].value as string,
  });

  protected canConfirm = computed(() => {
    const r = this.reasonValue();
    return typeof r === 'string' && r.trim().length > 0 && !this.submitting();
  });

  open(target: ReportTemplate): void {
    this.target.set(target);
    this.form.reset({ reason: '' });
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
    this.store.dispatch(new DisableTemplate(target.id, this.form.value.reason.trim())).subscribe({
      next: () => {
        this.submitting.set(false);
        this.dialogOpen.set(false);
        this.messages.add({ severity: 'success', summary: 'Plantilla deshabilitada' });
        this.disabled.emit();
      },
      error: (err) => {
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo deshabilitar',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }
}
