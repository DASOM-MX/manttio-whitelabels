import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { ContractsState } from '../../state/contracts/contracts.state';
import { CustomersState } from '../../state/customers/customers.state';
import { ContractsList } from './pages/contracts-list/contracts-list';
import { ContractView } from './pages/contract-view/contract-view';

/** Contracts (13 §6): the filing list → the contract view with its document,
 *  covered units and actions. Create/edit is a dialog rather than a page — a
 *  contract is a short record plus one upload, nothing like the order builder.
 *
 *  `CustomersState` rides along for the client select and the list's client
 *  filter; route providers don't reach across siblings, and the equipment pool
 *  for the covered-units multiselect is read straight from `EquipmentService`
 *  (the visit-dialog precedent) rather than pulling a third state in. */
export default [
  {
    path: '',
    providers: [provideStates([ContractsState, CustomersState])],
    children: [
      { path: '', component: ContractsList },
      { path: ':id', component: ContractView },
    ],
  },
] satisfies Routes;
