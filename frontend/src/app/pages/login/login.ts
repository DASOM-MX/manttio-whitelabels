import { Component } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { Register } from '../register/register';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.scss',
  imports: [CommonModule, ReactiveFormsModule, Register],
})
export class Login {
  loginForm;
  showRegister = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private http: HttpClient
  ) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  onSubmit() {
    if (this.loginForm.valid) {
      const { email, password } = this.loginForm.value;

      this.http
        .post(`${environment.apiUrl}auth/login`, { email, password })
        .subscribe({
          next: (response: any) => {
            console.log('Login exitoso', response);

            //Guardar el token
            localStorage.setItem('token', response.token);
            localStorage.setItem('role', response.user.role ? 'true' : 'false');
            localStorage.setItem('email', response.user.email);
            //redirigir
            this.router.navigate(['/reports']);
          },
          error: (error) => {
            console.error('Error al iniciar sesión', error);
            alert('Credenciales invalidas');
          },
        });

      //console.log('Datos del login:', email, password);
    }
  }

  toggleRegister() {
    this.showRegister = !this.showRegister;
  }
}
