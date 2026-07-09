import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { DeleteUser } from '../../../../state/users/users.actions';
import { errorMessage } from '../../../data/utils';
import type { User } from '../../../data/dtos/user';

/** Ported from the frontend's canonical `delete-user-dialog` (shape 3):
 *  required audit comment + typed-email confirmation → soft delete with
 *  `{ deleteComment }`. Self-contained: owns the dispatch and toasts. */
@Component({
  selector: 'app-delete-user-dialog',
  imports: [ReactiveFormsModule, DialogModule, InputTextModule, TextareaModule],
  templateUrl: './delete-user-dialog.html',
})
export class DeleteUserDialog {
  /** Emits the id of the just-deleted user (parent refreshes its list). */
  readonly deleted = output<string>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  protected dialogOpen = signal(false);
  protected target = signal<User | null>(null);
  protected submitting = signal(false);

  protected form: FormGroup = this.fb.group({
    comment: ['', [Validators.required]],
    emailConfirm: ['', [Validators.required]],
  });

  private commentValue = toSignal(this.form.controls['comment'].valueChanges, {
    initialValue: this.form.controls['comment'].value as string,
  });
  private emailConfirmValue = toSignal(this.form.controls['emailConfirm'].valueChanges, {
    initialValue: this.form.controls['emailConfirm'].value as string,
  });

  // Case-insensitive + whitespace-tolerant (frontend parity): emails are
  // case-insensitive by spec; the admin shouldn't fight the keyboard.
  protected emailMatches = computed(() => {
    const typed = (this.emailConfirmValue() ?? '').trim().toLowerCase();
    const ref = this.target()?.email.trim().toLowerCase() ?? '';
    return typed.length > 0 && typed === ref;
  });

  protected canConfirm = computed(() => {
    const c = this.commentValue();
    return (
      typeof c === 'string' && c.trim().length > 0 && this.emailMatches() && !this.submitting()
    );
  });

  open(target: User): void {
    this.target.set(target);
    this.form.reset({ comment: '', emailConfirm: '' });
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
      .dispatch(new DeleteUser(target.id, { deleteComment: this.form.value.comment.trim() }))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Usuario eliminado' });
          this.deleted.emit(target.id);
        },
        error: (err) => {
          this.submitting.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo eliminar el usuario',
            detail: errorMessage(err, 'Inténtalo de nuevo.'),
          });
        },
      });
  }
}
