import { Component, inject, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService } from 'primeng/api';
import { Store } from '@ngxs/store';
import { SaveBrand } from '../../../../state/brand/brand.actions';
import { errorMessage } from '../../../data/utils';
import type { SaveBrandRequest } from '../../../data/dtos/brand';

/** Confirm-heavy apply dialog (03 §6, shape 3): brand saves are direct-apply
 *  (03 §8 — website + both apps restyle immediately), so the commit is
 *  deliberate — the dialog restates the blast radius and gates the button on
 *  an explicit acknowledgement. Owns the SaveBrand dispatch + toasts; the
 *  page opens it via `open(payload)`. */
@Component({
  selector: 'app-apply-brand-dialog',
  imports: [ReactiveFormsModule, DialogModule, CheckboxModule],
  templateUrl: './apply-brand-dialog.html',
})
export class ApplyBrandDialog {
  private store = inject(Store);
  private messages = inject(MessageService);

  /** Parent hook (e.g. reset dirty state) after a successful apply. */
  applied = output<void>();

  protected dialogOpen = signal(false);
  protected busy = signal(false);
  protected acknowledge = new FormControl(false, { nonNullable: true });
  private payload: SaveBrandRequest | null = null;

  open(payload: SaveBrandRequest): void {
    this.payload = payload;
    this.acknowledge.setValue(false);
    this.dialogOpen.set(true);
  }

  protected close(): void {
    if (this.busy()) return;
    this.dialogOpen.set(false);
  }

  protected confirm(): void {
    if (!this.payload || !this.acknowledge.value || this.busy()) return;
    this.busy.set(true);
    this.store.dispatch(new SaveBrand(this.payload)).subscribe({
      next: () => {
        this.busy.set(false);
        this.dialogOpen.set(false);
        this.messages.add({
          severity: 'success',
          summary: 'Marca aplicada',
          detail: 'El sitio y las aplicaciones ya usan la nueva identidad.',
        });
        this.applied.emit();
      },
      error: (err) => {
        this.busy.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo aplicar',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }
}
