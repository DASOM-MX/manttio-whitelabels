import { Component } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-register',
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
  standalone: true
})
export class Register {
  registerForm;

  constructor(private fb: FormBuilder,
    private http: HttpClient,
    private router: Router) {
    this.registerForm = this.fb.group({

      name: ['', [Validators.required]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      role: [false, Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password');
    const confirmPassword = control.get('confirmPassword');

    if (password && confirmPassword && password.value !== confirmPassword.value) {
      return { passwordMismatch: true };
    }

    return null;
  }

  onSubmit() {
    if (this.registerForm.valid) {
      const { name, email, password, confirmPassword, role } = this.registerForm.value;
      console.log('Datos del registro:', { name, email, password, confirmPassword, role });
      // Aquí se debe llamar al servicio de registro


      this.http.post(`${environment.apiUrl}auth/register`, {
        name, email, password, role
      })
        .subscribe({
          next: (response: any) => {
            console.log('Registro exitoso', response);
            Swal.fire({
              title: 'Usuario registrado exitosamente',
              icon: 'success'
            })

            //Guardar token
            //localStorage.setItem('token', response.token)
            this.router.navigate(['/reports']);
          },
          error: (error) => {
            console.error('Error al registrar usuario', error);
            alert('Credenciales invalidas')
          }
        })
    }
  }

  getPasswordMismatchError(): boolean {
    return this.registerForm.hasError('passwordMismatch') &&
      (this.registerForm.get('confirmPassword')?.touched || false);
  }
}
