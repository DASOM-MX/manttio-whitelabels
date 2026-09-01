import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { CardModule } from 'primeng/card';
import { AuthResetPassword } from '../../../../state/auth/auth.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { errorMessage } from '../../../data/utils';
import { PasswordModule } from 'primeng/password';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    ToastModule,
    CardModule,
  ],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4">
      <div class="w-full max-w-md">
        <!-- Header -->
        <div class="text-center mb-8">
          <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-50">
            Restablecer contraseña
          </h1>
          <p class="text-sm text-surface-500 dark:text-surface-400 mt-2">
            Ingresa una nueva contraseña para tu cuenta
          </p>
        </div>

        <!-- Form Card -->
        <div class="bg-white dark:bg-surface-900 rounded-card shadow-card p-6">
          @if (invalidToken()) {
            <!-- Invalid Token Message -->
            <div class="text-center space-y-4">
              <div>
                <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-50">
                  Enlace inválido o expirado
                </h2>
                <p class="text-sm text-surface-500 dark:text-surface-400 mt-2">
                  El enlace de recuperación de contraseña ya no es válido.
                  Por favor solicita uno nuevo.
                </p>
              </div>
              <a routerLink="/forgot-password" pButton label="Solicitar nuevo enlace" class="btn w-full"></a>
            </div>
          } @else if (!submitted()) {
            <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-5">
              <!-- Password Field -->
              <div class="space-y-2">
                <label for="password" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
                  Nueva contraseña <span aria-hidden="true"> *</span>
                </label>
                <p-password
                  id="password"
                  formControlName="password"
                  [toggleMask]="true"
                  class="w-full"
                  [inputStyleClass]="'field-input w-full'"
                  [feedback]="false"
                  placeholder="Mínimo 8 caracteres"
                  (keyup.enter)="!form.invalid && onSubmit()"
                />
                @if (form.get('password')?.touched && form.get('password')?.errors?.['required']) {
                  <p class="field-error" role="alert">Ingresa una contraseña</p>
                }
                @if (form.get('password')?.touched && form.get('password')?.errors?.['minlength']) {
                  <p class="field-error" role="alert">La contraseña debe tener mínimo 8 caracteres</p>
                }
              </div>

              <!-- Confirm Password Field -->
              <div class="space-y-2">
                <label for="confirmPassword" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
                  Confirmar contraseña <span aria-hidden="true"> *</span>
                </label>
                <p-password
                  id="confirmPassword"
                  formControlName="confirmPassword"
                  [toggleMask]="true"
                  class="w-full"
                  [inputStyleClass]="'field-input w-full'"
                  [feedback]="false"
                  placeholder="Repite tu contraseña"
                  (keyup.enter)="!form.invalid && onSubmit()"
                />
                @if (form.get('confirmPassword')?.touched && form.get('confirmPassword')?.errors?.['required']) {
                  <p class="field-error" role="alert">Confirma tu contraseña</p>
                }
                @if (form.get('confirmPassword')?.touched && form.get('confirmPassword')?.errors?.['mismatch']) {
                  <p class="field-error" role="alert">Las contraseñas no coinciden</p>
                }
              </div>

              <!-- Submit Button -->
              <button
                type="submit"
                pButton
                label="Restablecer contraseña"
                class="btn w-full"
                [loading]="isLoading()"
                [disabled]="form.invalid || isLoading()"
              ></button>
            </form>
          } @else {
            <!-- Success Message -->
            <div class="text-center space-y-4">
              <div>
                <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-50">
                  Contraseña actualizada
                </h2>
                <p class="text-sm text-surface-500 dark:text-surface-400 mt-2">
                  Tu contraseña ha sido restablecida correctamente.
                  Ahora puedes iniciar sesión con tu nueva contraseña.
                </p>
              </div>
              <button
                type="button"
                pButton
                label="Ir a inicio de sesión"
                class="btn w-full"
                (click)="goToLogin()"
              ></button>
            </div>
          }
        </div>

        <!-- Error Toast -->
        <p-toast position="top-right" />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);

  form!: FormGroup;
  submitted = signal(false);
  invalidToken = signal(false);
  token: string | null = null;
  isLoading = computed(() => this.store.selectSnapshot(AuthState.loading));

  ngOnInit() {
    // Extract token from query params
    this.route.queryParamMap.subscribe((params) => {
      this.token = params.get('token');
      if (!this.token) {
        this.invalidToken.set(true);
      }
    });

    this.form = this.fb.group(
      {
        password: ['', [Validators.required, Validators.minLength(8)]],
        confirmPassword: ['', [Validators.required]],
      },
      { validators: this.passwordMatchValidator },
    );
  }

  private passwordMatchValidator(group: AbstractControl) {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;

    if (password && confirmPassword && password !== confirmPassword) {
      group.get('confirmPassword')?.setErrors({ mismatch: true });
      return { mismatch: true };
    }
    return null;
  }

  onSubmit() {
    if (this.form.invalid || !this.token) return;

    const payload = {
      token: this.token,
      password: this.form.get('password')?.value,
    };

    this.store.dispatch(new AuthResetPassword(payload)).subscribe({
      next: () => {
        this.submitted.set(true);
      },
      error: (err) => {
        const msg = errorMessage(err, 'No pudimos restablecer tu contraseña');
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: msg,
          life: 5000,
        });
      },
    });
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
