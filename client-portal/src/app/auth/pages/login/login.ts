import {
  Component,
  effect,
  inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { AuthLogin, AuthLoadMe } from '../../../../state/auth/auth.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { TurnstileService } from '../../../services/turnstile/turnstile.service';
import { errorMessage } from '../../../data/utils';

const TURNSTILE_SITE_KEY = '0x4AAAAAAADnzP-sKuZl2Drw';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    InputGroupModule,
    InputGroupAddonModule,
    PasswordModule,
    ToastModule,
  ],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4">
      <div class="w-full max-w-md">
        <!-- Logo / Branding -->
        <div class="text-center mb-8">
          <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-50">
            Portal de Clientes
          </h1>
          <p class="text-sm text-surface-500 dark:text-surface-400 mt-2">
            Accede a tus reportes y cotizaciones
          </p>
        </div>

        <!-- Form Card -->
        <div class="bg-white dark:bg-surface-900 rounded-card shadow-card p-6">
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-5">
            <!-- Email Field -->
            <div class="space-y-2">
              <label for="email" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
                Correo electrónico <span aria-hidden="true"> *</span>
              </label>
              <input
                id="email"
                type="email"
                formControlName="email"
                pInputText
                class="field-input w-full"
                placeholder="ejemplo@empresa.com"
                (keyup.enter)="!form.invalid && onSubmit()"
              />
              @if (form.get('email')?.touched && form.get('email')?.errors?.['email']) {
                <p class="field-error" role="alert">
                  Ingresa un correo válido
                </p>
              }
            </div>

            <!-- Password Field -->
            <div class="space-y-2">
              <label for="password" class="block text-sm font-medium text-surface-700 dark:text-surface-300">
                Contraseña <span aria-hidden="true"> *</span>
              </label>
              <p-password
                id="password"
                formControlName="password"
                [toggleMask]="true"
                class="w-full"
                [inputStyleClass]="'field-input w-full'"
                [feedback]="false"
                placeholder="Ingresa tu contraseña"
                (keyup.enter)="!form.invalid && onSubmit()"
              />
              @if (form.get('password')?.touched && form.get('password')?.errors?.['required']) {
                <p class="field-error" role="alert">
                  Ingresa tu contraseña
                </p>
              }
            </div>

            <!-- Turnstile Widget -->
            <div id="turnstile-widget" class="flex justify-center"></div>
            @if (turnstileError()) {
              <p class="field-error text-center" role="alert">
                {{ turnstileError() }}
              </p>
            }

            <!-- Submit Button -->
            <button
              type="submit"
              pButton
              label="Acceder"
              class="btn w-full"
              [loading]="isLoading()"
              [disabled]="form.invalid || isLoading()"
            ></button>

            <!-- Forgot Password Link -->
            <div class="text-center text-sm">
              <a
                routerLink="/forgot-password"
                class="link-action font-medium"
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>
          </form>
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
export class LoginComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly turnstile = inject(TurnstileService);

  form!: FormGroup;
  isLoading = computed(() => this.store.selectSnapshot(AuthState.loading));
  turnstileError = signal<string>('');

  constructor() {
    effect(() => {
      if (this.store.selectSnapshot(AuthState.isAuthenticated)) {
        const mustChange = this.store.selectSnapshot(AuthState.mustChangePassword);
        if (mustChange) {
          // ForcePasswordDialog handles the redirect; just dispatch LoadMe
          this.store.dispatch(new AuthLoadMe());
        } else {
          this.router.navigate(['/home']);
        }
      }
    });
  }

  ngOnInit() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(1)]],
    });

    // Render Turnstile widget asynchronously
    this.renderTurnstile().catch(() => {
      this.turnstileError.set('No pudimos cargar la verificación. Intenta de nuevo.');
    });
  }

  private async renderTurnstile() {
    try {
      const isDarkMode = this.store.selectSnapshot(state => state.app?.darkMode);
      await this.turnstile.render('turnstile-widget', {
        sitekey: TURNSTILE_SITE_KEY,
        theme: isDarkMode ? 'dark' : 'light',
      });
    } catch (err) {
      console.error('Turnstile render failed', err);
      throw err;
    }
  }

  onSubmit() {
    if (this.form.invalid) return;

    const turnstileToken = this.turnstile.getToken('turnstile-widget');
    if (!turnstileToken) {
      this.turnstileError.set('Por favor completa la verificación');
      return;
    }

    const payload = {
      ...this.form.getRawValue(),
      turnstileToken,
    };

    this.store.dispatch(new AuthLogin(payload)).subscribe({
      error: (err) => {
        const msg = errorMessage(err, 'Error al iniciar sesión');
        this.messageService.add({
          severity: 'error',
          summary: 'Error de inicio de sesión',
          detail: msg,
          life: 5000,
        });
        // Reset Turnstile for retry
        this.turnstile.reset('turnstile-widget');
      },
    });
  }
}
