import { Component, inject } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Register } from '../register/register';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.scss',
  imports: [
    ReactiveFormsModule,
    Register,
    InputTextModule,
    PasswordModule,
    ButtonModule,
  ],
})
export class Login {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private http = inject(HttpClient);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });
  showRegister = false;

  onSubmit() {
    if (this.loginForm.valid) {
      const { email, password } = this.loginForm.value;

      this.http
        .post(`${environment.apiUrl}auth/login`, { email, password })
        .subscribe({
          next: (response: any) => {
            localStorage.setItem('token', response.token);
            localStorage.setItem('role', response.user.role ? 'true' : 'false');
            localStorage.setItem('email', response.user.email);
            this.router.navigate(['/reports']);
          },
          error: (error) => {
            console.error('Error al iniciar sesión', error);
            alert('Credenciales invalidas');
          },
        });
    }
  }

  toggleRegister() {
    this.showRegister = !this.showRegister;
  }
}
