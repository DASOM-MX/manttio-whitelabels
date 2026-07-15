import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Actions, Store, ofActionSuccessful, ofActionErrored, select } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { Login as LoginAction } from '../../../../state/auth/auth.actions';
import { AppState } from '../../../../state/app/app.state';
import { BrandState } from '../../../../state/brand/brand.state';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.scss',
  imports: [
    ReactiveFormsModule,
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
  private messages = inject(MessageService);
  private darkMode = select(AppState.darkMode);
  private brand = select(BrandState.brand);

  /** Tenant logo for the login card — the dark-surface variant when dark mode
   *  is on (falls back to the light logo). No brand logo renders nothing
   *  (branding rule 5: absent identity hides, never fakes). */
  protected logoUrl = computed(() => {
    const brand = this.brand();
    if (!brand) return undefined;
    return this.darkMode() ? (brand.logoDarkUrl ?? brand.logoUrl) : brand.logoUrl;
  });

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });
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
        this.messages.add({ severity: 'error', summary: 'Credenciales inválidas' });
      });
  }

  onSubmit() {
    if (this.loginForm.invalid || this.submitting()) return;
    const { email, password } = this.loginForm.value;
    this.submitting.set(true);
    this.store.dispatch(new LoginAction({ email: email!, password: password! }));
  }
}
