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
