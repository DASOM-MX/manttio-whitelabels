import { Component, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Actions, Store, ofActionErrored, ofActionSuccessful } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { DeleteUser } from '../../../../state/users/users.actions';
import type { PublicUser } from '../../../data/dtos/user';

@Component({
  selector: 'app-delete-user-dialog',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    TextareaModule,
  ],
  templateUrl: './delete-user-dialog.html',
  styleUrl: './delete-user-dialog.scss',
})
export class DeleteUserDialog {
  /** Emits the id of the just-deleted user. The dialog already toasts and
   *  closes itself; this is for the parent to bump counters / refetch /
   *  navigate if it wants to. */
  readonly deleted = output<string>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);

  dialogOpen = signal(false);
  target = signal<PublicUser | null>(null);
  submitting = signal(false);

  form: FormGroup = this.fb.group({
    comment: ['', [Validators.required]],
    emailConfirm: ['', [Validators.required]],
  });

  private commentValue = toSignal(this.form.controls['comment'].valueChanges, {
    initialValue: this.form.controls['comment'].value as string,
  });

  private emailConfirmValue = toSignal(this.form.controls['emailConfirm'].valueChanges, {
    initialValue: this.form.controls['emailConfirm'].value as string,
  });

  // Case-insensitive + whitespace-tolerant: emails are case-insensitive by spec
  // and the admin shouldn't fight the keyboard to retype an exact match.
  emailMatches = computed(() => {
    const typed = (this.emailConfirmValue() ?? '').trim().toLowerCase();
    const ref = this.target()?.email.trim().toLowerCase() ?? '';
    return typed.length > 0 && typed === ref;
  });

  canConfirm = computed(() => {
    const c = this.commentValue();
    return (
      typeof c === 'string' &&
      c.trim().length > 0 &&
      this.emailMatches() &&
      !this.submitting()
    );
  });

  constructor() {
    this.actions$
      .pipe(ofActionSuccessful(DeleteUser), takeUntilDestroyed())
      .subscribe(() => {
        // Only react when *we* triggered the dispatch — guards against another
        // future component that might also dispatch DeleteUser.
        if (!this.submitting()) return;
        const id = this.target()?.id;
        this.submitting.set(false);
        this.close();
        this.messages.add({ severity: 'success', summary: 'Usuario eliminado' });
        if (id) this.deleted.emit(id);
      });

    this.actions$
      .pipe(ofActionErrored(DeleteUser), takeUntilDestroyed())
      .subscribe(() => {
        if (!this.submitting()) return;
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo eliminar el usuario',
        });
      });
  }

  open(target: PublicUser): void {
    this.target.set(target);
    this.form.reset({ comment: '', emailConfirm: '' });
    this.dialogOpen.set(true);
  }

  cancel(): void {
    if (this.submitting()) return;
    this.close();
  }

  confirm(): void {
    const target = this.target();
    if (!target || !this.canConfirm()) return;
    const comment = (this.form.controls['comment'].value as string).trim();
    this.submitting.set(true);
    this.store.dispatch(new DeleteUser(target.id, { deleteComment: comment }));
  }

  private close(): void {
    this.dialogOpen.set(false);
    this.target.set(null);
    this.form.reset({ comment: '', emailConfirm: '' });
  }
}
