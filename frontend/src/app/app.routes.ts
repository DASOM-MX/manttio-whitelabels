import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Reports } from './pages/reports/reports';
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
                loadComponent: () => import('./pages/reports/reports').then(m => m.Reports,)
            },
            {
                path: 'reports',
                loadComponent: () => import('./pages/reports/reports').then(m => m.Reports)
            },
            {
                path: 'reports/:id',
                loadComponent: () => import('./pages/report-detail/report-detail').then(m => m.ReportDetail)
            },
            {
                path: 'report-add',
                loadComponent: () => import('./pages/report-add/report-add').then(m => m.ReportAdd)
            },
            {
                path: 'customer-add',
                loadComponent: () => import('./pages/customer-add/customer-add').then(m => m.CustomerAdd)
            },
            {
                path: 'register',
                loadComponent: () => import('./pages/register/register').then(m => m.Register)
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
