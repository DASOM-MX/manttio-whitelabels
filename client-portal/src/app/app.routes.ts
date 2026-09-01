import { Routes } from '@angular/router';
import { LoginComponent } from './auth/pages/login/login';
import { ForgotPasswordComponent } from './auth/pages/forgot-password/forgot-password';
import { ResetPasswordComponent } from './auth/pages/reset-password/reset-password';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent,
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent,
  },
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full',
  },
];
