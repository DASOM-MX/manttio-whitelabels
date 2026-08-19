import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { ContractsState } from '../../state/contracts/contracts.state';
import { CustomersState } from '../../state/customers/customers.state';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { ContractsList } from './pages/contracts-list/contracts-list';
import { ContractForm } from './pages/contract-form/contract-form';
import { ContractView } from './pages/contract-view/contract-view';

/** Contracts (13 §6): filing list → form page → contract view.
 *
 *  The form is a **page, not a dialog** — filing a contract carries a document,
 *  covered units and a visibility decision, the shape is expected to keep
 *  growing, and a route means every entry point is just a link. That is what
 *  CP-3's "Generar contrato" needs: `/contracts/new?customer=…&order=…` opens
 *  the form with both pre-locked.
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
      // Before `:id`, or "new" would read as a contract id.
      { path: 'new', component: ContractForm, canDeactivate: [pendingChangesGuard] },
      { path: ':id', component: ContractView },
      { path: ':id/edit', component: ContractForm, canDeactivate: [pendingChangesGuard] },
    ],
  },
] satisfies Routes;
