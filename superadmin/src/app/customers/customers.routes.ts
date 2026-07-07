import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { CustomersState } from '../../state/customers/customers.state';
import { EquipmentState } from '../../state/equipment/equipment.state';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { CustomerStatus } from '../data/dtos/customer';
import { CustomersList } from './pages/customers-list/customers-list';
import { CustomerForm } from './pages/customer-form/customer-form';
import { CustomerView } from './pages/customer-view/customer-view';

export default [
  {
    path: '',
    providers: [provideStates([CustomersState, EquipmentState])],
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
      { path: 'new', component: CustomerForm, canDeactivate: [pendingChangesGuard] },
      { path: ':id', component: CustomerView },
      { path: ':id/edit', component: CustomerForm, canDeactivate: [pendingChangesGuard] },
    ],
  },
] satisfies Routes;
