import { Routes } from '@angular/router';
import { Login } from './auth/pages/login/login';
import { Reports } from './reports/pages/reports/reports';
import { AuthenticatedLayoutAdmin } from './layouts/authenticated-layout-admin';
import { authGuard } from './guards/auth-guard';
import { adminGuard } from './guards/admin-guard';
import { reportAddDeactivateGuard } from './guards/report-add-deactivate.guard';

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
                path: 'report/pending/:id',
                loadComponent: () => import('./reports/pages/report-detail/report-detail').then(m => m.ReportDetail)
            },
            {
                path: 'reports/:id',
                loadComponent: () => import('./reports/pages/report-detail/report-detail').then(m => m.ReportDetail)
            },
            {
                path: 'report-add',
                loadComponent: () => import('./reports/pages/report-add/report-add').then(m => m.ReportAdd),
                canDeactivate: [reportAddDeactivateGuard]
            },
            {
                path: 'customers',
                canActivate: [adminGuard],
                loadComponent: () => import('./customers/pages/customers/customers').then(m => m.Customers)
            },
            {
                path: 'customers/:id/edit',
                canActivate: [adminGuard],
                loadComponent: () => import('./customers/pages/customer-edit/customer-edit').then(m => m.CustomerEdit)
            },
            {
                path: 'customer-add',
                canActivate: [adminGuard],
                loadComponent: () => import('./customers/pages/customer-add/customer-add').then(m => m.CustomerAdd)
            },
            {
                path: 'register',
                canActivate: [adminGuard],
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
