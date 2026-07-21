import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { CustomersState } from '../../state/customers/customers.state';
import { CustomerStatsState } from '../../state/customer-stats/customer-stats.state';
import { EquipmentState } from '../../state/equipment/equipment.state';
import { ReportsState } from '../../state/reports/reports.state';
import { accessGuard } from '../guards/access.guard';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { CustomerStatus } from '../data/dtos/customer';
import { CustomersList } from './pages/customers-list/customers-list';
import { CustomerForm } from './pages/customer-form/customer-form';
import { CustomerView } from './pages/customer-view/customer-view';
import { CrmDashboard } from '../crm/pages/dashboard/dashboard';

export default [
  {
    path: '',
    providers: [
      provideStates([CustomersState, CustomerStatsState, EquipmentState, ReportsState]),
    ],
    children: [
      { path: '', component: CustomersList, data: { title: 'Clientes' } },
      {
        path: 'leads',
        component: CustomersList,
        data: { title: 'Leads', presetStatus: CustomerStatus.Lead },
      },
      {
        path: 'blacklist',
        component: CustomersList,
        data: { title: 'Lista negra', presetStatus: CustomerStatus.Blacklisted },
      },
      // CRM Panel (utm-params 03, relocated 2026-07-20): read-only, no
      // pendingChangesGuard. Its reads are owner/admin-only — narrower than
      // the module gate — so it carries its own accessGuard data.
      {
        path: 'dashboard',
        component: CrmDashboard,
        canMatch: [accessGuard],
        data: { title: 'Panel', module: 'customers', roles: ['owner', 'admin'] },
      },
      { path: 'new', component: CustomerForm, canDeactivate: [pendingChangesGuard] },
      { path: ':id', component: CustomerView },
      { path: ':id/edit', component: CustomerForm, canDeactivate: [pendingChangesGuard] },
    ],
  },
] satisfies Routes;
