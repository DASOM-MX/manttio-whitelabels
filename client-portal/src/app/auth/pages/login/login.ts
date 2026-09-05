import {
  Component,
  DestroyRef,
  effect,
  inject,
  OnInit,
  signal,
  computed,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { select, Store } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { PasswordModule } from 'primeng/password';
import { ToastModule } from 'primeng/toast';
import { AppState } from '../../../../state/app/app.state';
import { AuthLogin, AuthLoadMe } from '../../../../state/auth/auth.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { BrandState } from '../../../../state/brand/brand.state';
import { TurnstileThemeService } from '../../../services/theme/turnstile-theme.service';
import { TurnstileService } from '../../../services/turnstile/turnstile.service';
import { errorMessage } from '../../../data/utils';

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
  private readonly turnstileTheme = inject(TurnstileThemeService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly darkMode = select(AppState.darkMode);
  private readonly brand = select(BrandState.data);

  /** Tenant logo above the form — the dark-surface variant in dark mode,
   *  falling back to the light one. A brandless tenant renders no image at
   *  all (branding rule 5: absent identity hides, never fakes). Reactive
   *  because `LoadBrand` resolves after boot, not before this page paints. */
  protected logoUrl = computed(() => {
    const brand = this.brand();
    if (!brand) return undefined;
    return this.darkMode() ? (brand.logoDarkUrl ?? brand.logoUrl) : brand.logoUrl;
  });
  protected logoAlt = computed(() => this.brand()?.name ?? 'Logo');

  form!: FormGroup;
  isLoading = computed(() => this.store.selectSnapshot(AuthState.loading));
  turnstileError = signal<string>('');
  /** Drives both the widget slot and whether a token is required. */
  protected readonly turnstileConfigured = this.turnstileTheme.configured;

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
