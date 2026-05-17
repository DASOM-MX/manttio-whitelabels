import { Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import { Register } from '../register/register';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { ButtonModule } from 'primeng/button';
import { Login as LoginAction } from '../../store/auth/actions/login';

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
  private store = inject(Store);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });
  showRegister = signal(false);
  submitting = signal(false);

  onSubmit() {
    if (this.loginForm.invalid || this.submitting()) return;
    const { email, password } = this.loginForm.value;
    this.submitting.set(true);
    this.store.dispatch(new LoginAction(email!, password!)).subscribe({
      next: () => {
        this.submitting.set(false);
        this.router.navigate(['/reports']);
      },
      error: (error) => {
        this.submitting.set(false);
        console.error('Error al iniciar sesión', error);
        alert('Credenciales invalidas');
      },
    });
  }

  toggleRegister() {
    this.showRegister.update((v) => !v);
  }
}
