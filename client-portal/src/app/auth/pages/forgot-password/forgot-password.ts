import { Component, DestroyRef, inject, OnInit, signal, computed } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
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
import { TurnstileThemeService } from '../../../services/theme/turnstile-theme.service';
import { TurnstileService } from '../../../services/turnstile/turnstile.service';
import { errorMessage } from '../../../data/utils';

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
  templateUrl: './forgot-password.html',
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
  private readonly turnstileTheme = inject(TurnstileThemeService);
  private readonly destroyRef = inject(DestroyRef);

  form!: FormGroup;
  submitted = signal(false);
  isLoading = computed(() => this.store.selectSnapshot(AuthState.loading));
  turnstileError = signal<string>('');
  /** Drives both the widget slot and whether a token is required. */
  protected readonly turnstileConfigured = this.turnstileTheme.configured;

  ngOnInit() {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
    });

    // Fire-and-forget: the challenge resolves on its own time, and this page
    // must paint whether or not the visitor ever completes it.
    this.turnstileTheme
      .render('turnstile-widget')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        error: () => {
          // No key configured is a supported state, not a failure to report.
          if (this.turnstileConfigured) {
            this.turnstileError.set('No pudimos cargar la verificación. Intenta de nuevo.');
          }
        },
      });
  }

  onSubmit() {
    if (this.form.invalid) return;

    const turnstileToken = this.turnstile.getToken('turnstile-widget');
    if (this.turnstileConfigured && !turnstileToken) {
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
