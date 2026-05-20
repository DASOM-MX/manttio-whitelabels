import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Actions, Store, ofActionSuccessful, ofActionErrored } from '@ngxs/store';
import { ToastService } from '../../../services/toast.service';
import { Register } from '../register/register';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { Login as LoginAction } from '../../../state/auth/auth.actions';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.scss',
  imports: [
    ReactiveFormsModule,
    Register,
    InputTextModule,
    PasswordModule,
    ButtonModule,
  ],
})
export class Login {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private toast = inject(ToastService);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });
  showRegister = signal(false);
  submitting = signal(false);

  constructor() {
    this.actions$
      .pipe(ofActionSuccessful(LoginAction), takeUntilDestroyed())
      .subscribe(() => {
        this.submitting.set(false);
        this.router.navigate(['/home']);
      });

    this.actions$
      .pipe(ofActionErrored(LoginAction), takeUntilDestroyed())
      .subscribe(() => {
        this.submitting.set(false);
        this.toast.show('Credenciales inválidas', 'error');
      });
  }

  onSubmit() {
    if (this.loginForm.invalid || this.submitting()) return;
    const { email, password } = this.loginForm.value;
    this.submitting.set(true);
    this.store.dispatch(new LoginAction({ email: email!, password: password! }));
  }

  toggleRegister() {
    this.showRegister.update((v) => !v);
  }
}
