import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { TextareaModule } from 'primeng/textarea';
import { RevokePortalUserAccess } from '../../../../state/portal-users/portal-users.actions';
import { errorMessage } from '../../../data/utils';
import type { PortalUserDetail } from '../../../data/dtos/portal-user/portal-user';

/** Revoke (26 §4) — the permanent lifecycle action: soft delete with a
 *  required comment, mirroring the users module's revoke-with-comment
 *  (`users/components/delete-user-dialog`). Never "eliminar" anywhere in
 *  this dialog — the contact survives, only the login goes, and the account
 *  is re-invitable later; the copy says exactly that instead of implying a
 *  deletion. */
@Component({
  selector: 'app-revoke-portal-user-access-dialog',
  imports: [ReactiveFormsModule, DialogModule, TextareaModule],
  templateUrl: './revoke-portal-user-access-dialog.html',
})
export class RevokePortalUserAccessDialog {
  /** Fires after a successful revoke — the parent leaves the page, since
   *  there is nothing left here to edit. */
  readonly revoked = output<void>();

  private readonly fb = inject(FormBuilder);
  private readonly store = inject(Store);
  private readonly messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected target = signal<PortalUserDetail | null>(null);
  protected submitting = signal(false);

  protected form = this.fb.nonNullable.group({
    comment: ['', [Validators.required, Validators.maxLength(255)]],
  });

  private commentValue = toSignal(this.form.controls.comment.valueChanges, {
    initialValue: this.form.controls.comment.value,
  });

  /** Required, not optional (the validator's own comment: an optional
   *  comment writes NULL into the audit column the rule exists to fill). */
  protected canConfirm = computed(
    () => this.commentValue().trim().length > 0 && !this.submitting(),
  );

  open(target: PortalUserDetail): void {
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
      .dispatch(new RevokePortalUserAccess(target.id, this.form.getRawValue().comment.trim()))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Acceso revocado' });
          this.revoked.emit();
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo revocar el acceso',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}
