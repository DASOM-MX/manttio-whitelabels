import { Routes } from '@angular/router';
import { Login } from './auth/pages/login/login';
import { Reports } from './reports/pages/reports/reports';
import { AuthenticatedLayoutAdmin } from './layouts/authenticated-layout-admin';
import { authGuard } from './guards/auth-guard';

export const routes: Routes = [
    {
        path: '',
        component: AuthenticatedLayoutAdmin,
        canActivate: [authGuard],
        children: [
            {
                path: 'home',
                loadComponent: () => import('./reports/pages/reports/reports').then(m => m.Reports,)
            },
            {
                path: 'reports',
                loadComponent: () => import('./reports/pages/reports/reports').then(m => m.Reports)
            },
            {
                path: 'reports/:id',
                loadComponent: () => import('./reports/pages/report-detail/report-detail').then(m => m.ReportDetail)
            },
            {
                path: 'report-add',
                loadComponent: () => import('./reports/pages/report-add/report-add').then(m => m.ReportAdd)
            },
            {
                path: 'customers',
                loadComponent: () => import('./customers/pages/customers/customers').then(m => m.Customers)
            },
            {
                path: 'customer-add',
                loadComponent: () => import('./customers/pages/customer-add/customer-add').then(m => m.CustomerAdd)
            },
            {
                path: 'register',
                loadComponent: () => import('./auth/pages/register/register').then(m => m.Register)
            },
            {
                path: '',
                redirectTo: 'home',
                pathMatch: 'full'
            }
        ]
    },
    {
        path: 'login',
        component: Login
    }
];
