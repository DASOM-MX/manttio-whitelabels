import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./auth/pages/login/login').then((m) => m.LoginComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./auth/pages/forgot-password/forgot-password').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./auth/pages/reset-password/reset-password').then((m) => m.ResetPasswordComponent),
  },
  {
    path: '',
    redirectTo: '/login',
    pathMatch: 'full',
  },
];
