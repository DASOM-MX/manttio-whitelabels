import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { environment } from '../../../environments/environment';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { RoleOption } from '../../interfaces/role-option';

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
  private http = inject(HttpClient);
  private router = inject(Router);

  readonly roleOptions: RoleOption[] = [
    { label: 'Técnico', value: false },
    { label: 'Administrador', value: true },
  ];

  registerForm = this.fb.group(
    {
      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      role: [false, Validators.required],
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

    this.http
      .post(`${environment.apiUrl}auth/register`, { name, email, password, role })
      .subscribe({
        next: () => {
          this.submitting.set(false);
          Swal.fire({
            title: 'Usuario registrado exitosamente',
            icon: 'success',
          });
          this.router.navigate(['/reports']);
        },
        error: (error) => {
          this.submitting.set(false);
          console.error('Error al registrar usuario', error);
          alert('Credenciales invalidas');
        },
      });
  }
}
