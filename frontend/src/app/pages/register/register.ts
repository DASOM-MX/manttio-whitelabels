import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { ToastService } from '../../../services/toast.service';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { RoleOption } from '../../interfaces/role-option';
import { CreateUser } from '../../../state/users/users.actions';
import type { UserType } from '../../data/types/user';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    InputTextModule,
    PasswordModule,
    SelectModule,
    ButtonModule,
  ],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private store = inject(Store);
  private toast = inject(ToastService);

  readonly roleOptions: RoleOption[] = [
    { label: 'Técnico', value: 'technician' },
    { label: 'Administrador', value: 'admin' },
  ];

  registerForm = this.fb.group(
    {
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      role: ['technician' as UserType, Validators.required],
    },
    { validators: this.passwordMatchValidator },
  );

  submitting = signal(false);

  private formStatus = toSignal(this.registerForm.statusChanges, {
    initialValue: this.registerForm.status,
  });

  passwordMismatch = computed(() => {
    void this.formStatus();
    return (
      this.registerForm.hasError('passwordMismatch') &&
      (this.registerForm.get('confirmPassword')?.touched || false)
    );
  });

  private passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');
    if (password && confirmPassword && password.value !== confirmPassword.value) {
      return { passwordMismatch: true };
    }
    return null;
  }

  onSubmit() {
    if (this.registerForm.invalid || this.submitting()) return;
    const { name, email, password, role } = this.registerForm.value;
    this.submitting.set(true);

    this.store
      .dispatch(new CreateUser({ name: name!, email: email!, password: password!, role: role as UserType }))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.toast.show('Usuario registrado exitosamente', 'success');
          this.router.navigate(['/reports']);
        },
        error: (error) => {
          this.submitting.set(false);
          console.error('Error al registrar usuario', error);
          this.toast.show('No se pudo registrar el usuario', 'error');
        },
      });
  }
}
