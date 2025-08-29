import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Reports } from './pages/reports/reports';
import { Search } from './pages/search/search';
import { AuthenticatedLayoutAdmin } from './layouts/authenticated-layout-admin';
import { AuthGuard } from './auth/auth-guard';

export const routes: Routes = [
    {
        path: '',
        component: AuthenticatedLayoutAdmin,
        canActivate: [AuthGuard],
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
                path: 'search',
                loadComponent: () => import('./pages/search/search').then(m => m.Search)
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