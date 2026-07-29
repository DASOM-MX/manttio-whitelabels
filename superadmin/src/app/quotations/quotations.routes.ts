import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { QuotationsState } from '../../state/quotations/quotations.state';
import { CustomersState } from '../../state/customers/customers.state';
import { ServicesState } from '../../state/services/services.state';
import { QuotationsList } from './pages/quotations-list/quotations-list';
import { QuotationBuilder } from './pages/quotation-builder/quotation-builder';
import { QuotationView } from './pages/quotation-view/quotation-view';

/** `new` and `:id/edit` share one builder: editing a draft is the same form,
 *  and PATCH replaces the line set wholesale anyway. `:id` stays last so the
 *  literal segment wins. */
export default [
  {
    path: '',
    // CustomersState feeds the client filter + the builder's client select;
    // ServicesState is the catalog the line builder picks from.
    providers: [provideStates([QuotationsState, CustomersState, ServicesState])],
    children: [
      { path: '', component: QuotationsList },
      { path: 'new', component: QuotationBuilder, canDeactivate: [pendingChangesGuard] },
      { path: ':id/edit', component: QuotationBuilder, canDeactivate: [pendingChangesGuard] },
      { path: ':id', component: QuotationView },
    ],
  },
] satisfies Routes;
