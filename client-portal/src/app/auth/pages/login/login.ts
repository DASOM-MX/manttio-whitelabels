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
  templateUrl: './login.html',
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
