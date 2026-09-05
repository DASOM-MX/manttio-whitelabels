import { Routes } from '@angular/router';
import { portalAuthGuard } from './guards/portal-auth.guard';
import { grantGuard } from './guards/grant.guard';
import { PortalGrant } from './model/enums/portal-auth/portal-grants.enum';

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
    canActivate: [portalAuthGuard],
    loadComponent: () =>
      import('./layouts/authenticated-layout/authenticated-layout').then(
        (m) => m.AuthenticatedLayout,
      ),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        loadComponent: () => import('./home/pages/home/home').then((m) => m.HomeComponent),
      },
      {
        path: 'reports',
        canActivate: [grantGuard(PortalGrant.ViewReports)],
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./reports/pages/reports-list/reports-list').then((m) => m.ReportsList),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./reports/pages/report-detail/report-detail').then((m) => m.ReportDetail),
          },
        ],
      },
      {
        path: 'contracts',
        canActivate: [grantGuard(PortalGrant.ViewContracts)],
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./contracts/pages/contracts-list/contracts-list').then(
                (m) => m.ContractsList,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./contracts/pages/contract-detail/contract-detail').then(
                (m) => m.ContractDetail,
              ),
          },
        ],
      },
      {
        path: 'quotations',
        canActivate: [grantGuard(PortalGrant.ViewQuotations)],
        children: [
          {
            path: '',
            pathMatch: 'full',
            loadComponent: () =>
              import('./quotations/pages/quotations-list/quotations-list').then(
                (m) => m.QuotationsList,
              ),
          },
          {
            path: ':id',
            loadComponent: () =>
              import('./quotations/pages/quotation-detail/quotation-detail').then(
                (m) => m.QuotationDetail,
              ),
          },
        ],
      },
      { path: '**', redirectTo: 'home' },
    ],
  },
];
