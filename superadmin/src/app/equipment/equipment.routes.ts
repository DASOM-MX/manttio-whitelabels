import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { EquipmentState } from '../../state/equipment/equipment.state';
import { CustomersState } from '../../state/customers/customers.state';
import { EquipmentList } from './pages/equipment-list/equipment-list';
import { EquipmentView } from './pages/equipment-view/equipment-view';

export default [
  {
    path: '',
    // CustomersState feeds the client filter/select on this side too.
    providers: [provideStates([EquipmentState, CustomersState])],
    children: [
      { path: '', component: EquipmentList },
      { path: ':id', component: EquipmentView },
    ],
  },
] satisfies Routes;
