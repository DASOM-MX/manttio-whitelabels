import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { CustomersState } from '../../state/customers/customers.state';
import { EquipmentState } from '../../state/equipment/equipment.state';
import { ReportsState } from '../../state/reports/reports.state';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { CustomerStatus } from '../data/dtos/customer';
import { CustomersList } from './pages/customers-list/customers-list';
import { CustomerForm } from './pages/customer-form/customer-form';
import { CustomerView } from './pages/customer-view/customer-view';
import { ShareLinks } from './pages/share-links/share-links';

export default [
  {
    path: '',
    providers: [provideStates([CustomersState, EquipmentState, ReportsState])],
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
      { path: 'share-links', component: ShareLinks, data: { title: 'Enlaces de contacto' } },
      { path: 'new', component: CustomerForm, canDeactivate: [pendingChangesGuard] },
      { path: ':id', component: CustomerView },
      { path: ':id/edit', component: CustomerForm, canDeactivate: [pendingChangesGuard] },
    ],
  },
] satisfies Routes;
