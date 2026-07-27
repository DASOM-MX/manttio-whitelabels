import { Routes } from '@angular/router';
import { AuthenticatedLayout } from './layouts/authenticated-layout/authenticated-layout';
import { authGuard } from './guards/auth.guard';
import { guestGuard } from './guards/guest.guard';
import { accessGuard } from './guards/access.guard';
import { landingGuard } from './guards/landing.guard';

/** Every module area is lazy (`loadChildren` per feature folder) so module
 *  agents ship independently; every entry declares `data: { module, roles }`
 *  for the central `canMatch` access guard (14-access-control.md §3). */
export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./auth/pages/login/login').then((m) => m.Login),
  },
  {
    path: '',
    canActivate: [authGuard],
    component: AuthenticatedLayout,
    children: [
      { path: '', pathMatch: 'full', canActivate: [landingGuard], children: [] },
      {
        path: 'dashboard',
        canMatch: [accessGuard],
        data: { module: 'dashboard', roles: ['owner', 'admin', 'office'] },
        loadChildren: () => import('./dashboard/dashboard.routes'),
      },
      {
        path: 'calendar',
        canMatch: [accessGuard],
        data: { module: 'calendar', roles: ['owner', 'admin', 'office', 'technician'] },
        loadChildren: () => import('./calendar/calendar.routes'),
      },
      {
        path: 'users',
        canMatch: [accessGuard],
        data: { module: 'users', roles: ['owner', 'admin'] },
        loadChildren: () => import('./users/users.routes'),
      },
      {
        path: 'reports',
        canMatch: [accessGuard],
        data: { module: 'reports', roles: ['owner', 'admin', 'office', 'technician'] },
        loadChildren: () => import('./reports/reports.routes'),
      },
      {
        path: 'templates',
        canMatch: [accessGuard],
        data: { module: 'templates', roles: ['owner', 'admin'] },
        loadChildren: () => import('./templates/templates.routes'),
      },
      {
        path: 'billing',
        canMatch: [accessGuard],
        data: { module: 'billing', roles: ['owner', 'admin', 'office'] },
        loadChildren: () => import('./billing/billing.routes'),
      },
      {
        path: 'customers',
        canMatch: [accessGuard],
        data: { module: 'customers', roles: ['owner', 'admin', 'office'] },
        loadChildren: () => import('./customers/customers.routes'),
      },
      {
        path: 'equipment',
        canMatch: [accessGuard],
        data: { module: 'equipment', roles: ['owner', 'admin', 'office'] },
        loadChildren: () => import('./equipment/equipment.routes'),
      },
      {
        path: 'services',
        canMatch: [accessGuard],
        data: { module: 'services', roles: ['owner', 'admin', 'office', 'technician'] },
        loadChildren: () => import('./service-catalog/service-catalog.routes'),
      },
      {
        path: 'quotations',
        canMatch: [accessGuard],
        data: { module: 'quotations', roles: ['owner', 'admin', 'office'] },
        loadChildren: () => import('./quotations/quotations.routes'),
      },
      {
        path: 'service-orders',
        canMatch: [accessGuard],
        data: {
          module: 'service-orders',
          roles: ['owner', 'admin', 'office', 'technician'],
        },
        loadChildren: () => import('./service-orders/service-orders.routes'),
      },
      {
        path: 'contracts',
        canMatch: [accessGuard],
        data: { module: 'contracts', roles: ['owner', 'admin', 'office'] },
        loadChildren: () => import('./contracts/contracts.routes'),
      },
      {
        path: 'branding',
        canMatch: [accessGuard],
        data: { module: 'branding', roles: ['owner', 'admin'] },
        loadChildren: () => import('./branding/branding.routes'),
      },
      {
        path: 'cms',
        canMatch: [accessGuard],
        data: { module: 'cms', roles: ['owner', 'admin'] },
        loadChildren: () => import('./cms/cms.routes'),
      },
      {
        path: 'warehouse',
        canMatch: [accessGuard],
        data: { module: 'wms', roles: ['owner', 'admin', 'office', 'technician'] },
        loadChildren: () => import('./wms/wms.routes'),
      },
      { path: '**', redirectTo: '' },
    ],
  },
  { path: '**', redirectTo: '' },
];
