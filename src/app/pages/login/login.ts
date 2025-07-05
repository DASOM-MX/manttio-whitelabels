import { Component } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { HlmInputDirective } from '@spartan-ng/helm/input';
import { Router } from '@angular/router';
import { Register } from '../register/register';

@Component({
  selector: 'app-login',
  standalone: true,
  templateUrl: './login.html',
  styleUrl: './login.scss',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    HlmInputDirective,
    Register
  ],
})
export class Login {
  loginForm;
  showRegister = false;

  constructor(private fb: FormBuilder, private router: Router) {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  onSubmit() {
    if (this.loginForm.valid) {
      const { email, password } = this.loginForm.value;
      console.log('Datos del login:', email, password);
      this.router.navigate(['/reports']);
    }
  }

  toggleRegister() {
    this.showRegister = !this.showRegister;
  }
}
