import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { Store } from '@ngxs/store';
import { Login as LoginAction } from '../../../../state/auth/auth.actions';
import { errorMessage } from '../../../data/utils';

/** Two-panel login (02-app-shell.md §3): 60% clean form / 40% brand panel on
 *  a dark brand-primary background. No social login, no self-serve reset —
 *  resets go through the tenant's owner/admin (users module). */
@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, InputTextModule, PasswordModule],
  templateUrl: './login.html',
})
export class Login {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private router = inject(Router);

  protected form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected busy = signal(false);
  protected error = signal<string | null>(null);

  protected submit(): void {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set(null);
    this.store.dispatch(new LoginAction(this.form.getRawValue())).subscribe({
      next: () => this.router.navigateByUrl('/'),
      error: (err) => {
        this.busy.set(false);
        this.error.set(
          err?.status === 401
            ? 'Correo o contraseña incorrectos.'
            : errorMessage(err, 'No se pudo iniciar sesión. Inténtalo de nuevo.'),
        );
      },
    });
  }
}
