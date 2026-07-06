import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { PasswordModule } from 'primeng/password';
import { MessageService } from 'primeng/api';
import { select, Store } from '@ngxs/store';
import { AuthState } from '../../../../state/auth/auth.state';
import { ChangePassword, Logout } from '../../../../state/auth/auth.actions';
import { passwordMatchValidator } from '../../../validators/password-match.validator';
import { errorMessage } from '../../../data/utils';

/** Unskippable set-your-own-password dialog (02 §3): interposed right after
 *  login whenever `/auth/me` carries `mustChangePassword`. Modal, no close,
 *  no ESC — a deliberate, documented exception to the 01 escape-routes rule;
 *  logout is the only other exit. */
@Component({
  selector: 'app-force-password-dialog',
  imports: [ReactiveFormsModule, DialogModule, PasswordModule],
  templateUrl: './force-password-dialog.html',
})
export class ForcePasswordDialog {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);

  private mustChange = select(AuthState.mustChangePassword);
  protected visible = computed(() => this.mustChange());

  protected form = this.fb.nonNullable.group(
    {
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required],
    },
    { validators: passwordMatchValidator },
  );

  protected busy = signal(false);
  protected error = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.store
      .dispatch(new ChangePassword({ password: this.form.getRawValue().password }))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.form.reset();
          this.messages.add({
            severity: 'success',
            summary: 'Contraseña actualizada',
            detail: 'Tu nueva contraseña ya está activa.',
          });
        },
        error: (err) => {
          this.busy.set(false);
          this.error.set(errorMessage(err, 'No se pudo actualizar la contraseña.'));
        },
      });
  }

  protected logout(): void {
    this.store.dispatch(new Logout());
  }
}
