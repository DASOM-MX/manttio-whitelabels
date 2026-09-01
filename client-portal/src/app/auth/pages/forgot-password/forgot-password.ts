import { Component, inject, OnInit, signal, computed, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { CardModule } from 'primeng/card';
import { AuthForgotPassword } from '../../../../state/auth/auth.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { TurnstileService } from '../../../services/turnstile/turnstile.service';
import { errorMessage } from '../../../data/utils';

const TURNSTILE_SITE_KEY = '0x4AAAAAAADnzP-sKuZl2Drw';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    ToastModule,
    CardModule,
  ],
  template: `
    <div class="min-h-screen bg-background flex items-center justify-center px-4">
      <div class="w-full max-w-md">
        <!-- Back Link -->
        <div class="mb-6">
          <a routerLink="/login" class="link-action text-sm font-medium">
            ← Volver a inicio de sesión
          </a>
        </div>

        <!-- Header -->
        <div class="text-center mb-8">
          <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-50">
            Recuperar contraseña
          </h1>
          <p class="text-sm text-surface-500 dark:text-surface-400 mt-2">
            Ingresa tu correo electrónico para recibir un enlace de recuperación
          </p>
        </div>

        <!-- Form Card -->
        <div class="bg-white dark:bg-surface-900 rounded-card shadow-card p-6">
          @if (!submitted()) {
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
                label="Enviar enlace"
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
                  Revisa tu correo
                </h2>
                <p class="text-sm text-surface-500 dark:text-surface-400 mt-2">
                  Si esta dirección de correo está asociada a una cuenta en nuestro portal,
                  recibirás un enlace para recuperar tu contraseña en los próximos minutos.
                </p>
              </div>
              <button
                type="button"
                pButton
                label="Volver a inicio de sesión"
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
export class ForgotPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly turnstile = inject(TurnstileService);

  form!: FormGroup;
  submitted = signal(false);
  isLoading = computed(() => this.store.selectSnapshot(AuthState.loading));
  turnstileError = signal<string>('');

  ngOnInit() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
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
      email: this.form.get('email')?.value,
      turnstileToken,
    };

    this.store.dispatch(new AuthForgotPassword(payload)).subscribe({
      next: () => {
        this.submitted.set(true);
      },
      error: (err) => {
        const msg = errorMessage(err, 'No pudimos procesar tu solicitud');
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: msg,
          life: 5000,
        });
        this.turnstile.reset('turnstile-widget');
      },
    });
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }
}
