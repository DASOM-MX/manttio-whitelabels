import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { QuotationsService } from '../../../services/http/quotations.service';
import { errorMessage } from '../../../data/utils';

/** Tenant default terms (PR-C) — what every new quote's Términos starts as.
 *  Owner/admin only (the trigger is gated in the list page); loads on open so
 *  it always edits the current value, saves through the http service — no
 *  list state involved. */
@Component({
  selector: 'app-quotation-settings-dialog',
  imports: [ReactiveFormsModule, DialogModule, TextareaModule],
  templateUrl: './quotation-settings-dialog.html',
})
export class QuotationSettingsDialog {
  private fb = inject(FormBuilder);
  private quotationsService = inject(QuotationsService);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected loading = signal(false);
  protected saving = signal(false);

  protected form = this.fb.nonNullable.group({ defaultComments: [''] });

  open(): void {
    this.dialogOpen.set(true);
    this.loading.set(true);
    this.quotationsService.getSettings().subscribe({
      next: (settings) => {
        this.form.setValue({ defaultComments: settings.defaultComments });
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudieron cargar los términos',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  protected close(): void {
    if (this.saving()) return;
    this.dialogOpen.set(false);
  }

  protected save(): void {
    if (this.saving() || this.loading()) return;
    this.saving.set(true);
    this.quotationsService
      .saveSettings({ defaultComments: this.form.getRawValue().defaultComments.trim() })
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Términos guardados' });
        },
        error: (err) => {
          this.saving.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudieron guardar',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}
