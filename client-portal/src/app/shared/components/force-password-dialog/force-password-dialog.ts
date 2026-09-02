import { Component, inject, signal, computed, effect, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { DialogModule } from 'primeng/dialog';
import { DialogService } from 'primeng/dynamicdialog';
import { AuthChangePassword } from '../../../../state/auth/auth.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { errorMessage } from '../../../data/utils';

@Component({
  selector: 'app-force-password-dialog',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    ButtonModule,
    InputTextModule,
    PasswordModule,
    DialogModule,
  ],
  templateUrl: './force-password-dialog.html',
  styles: `
    :host {
      display: block;
    }
  `,
})
export class ForcePasswordDialogComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly dialogService = inject(DialogService);

  form!: FormGroup;
  visible = signal(false);
  isLoading = computed(() => this.store.selectSnapshot(AuthState.loading));

  constructor() {
    // Show dialog when mustChangePassword is true and user is authenticated
    effect(() => {
      const mustChange = this.store.selectSnapshot(AuthState.mustChangePassword);
      const isAuth = this.store.selectSnapshot(AuthState.isAuthenticated);

      if (isAuth && mustChange) {
        this.visible.set(true);
      } else {
        this.visible.set(false);
      }
    });
  }

  ngOnInit() {
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
    if (this.form.invalid) return;

    const payload = {
      password: this.form.get('password')?.value,
    };

    this.store.dispatch(new AuthChangePassword(payload)).subscribe({
      next: () => {
        // Password changed successfully, dialog will close due to effect above
        this.router.navigate(['/home']);
      },
      error: (err) => {
        // Error is already in state.error, but no toast here (handled by page)
        console.error('Password change failed:', err);
      },
    });
  }
}
