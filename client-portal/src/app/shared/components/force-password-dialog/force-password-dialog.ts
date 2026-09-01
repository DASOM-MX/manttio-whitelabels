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
  template: `
    <p-dialog
      [(visible)]="visible"
      [modal]="true"
      [closable]="false"
      [closeOnEscape]="false"
      [showHeader]="true"
      headerStyleClass="pb-0"
      [styleClass]="'w-full sm:w-96'"
    >
      <ng-template pTemplate="header">
        <h2 class="text-lg font-semibold text-surface-900 dark:text-surface-50">
          Establecer contraseña
        </h2>
      </ng-template>

      <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-5">
        <p class="text-sm text-surface-600 dark:text-surface-400">
          Por seguridad, debes establecer una nueva contraseña antes de continuar.
        </p>

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
          label="Continuar"
          class="btn w-full"
          [loading]="isLoading()"
          [disabled]="form.invalid || isLoading()"
        ></button>
      </form>
    </p-dialog>
  `,
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
