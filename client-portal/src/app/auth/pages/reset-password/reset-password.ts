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
  templateUrl: './reset-password.html',
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
