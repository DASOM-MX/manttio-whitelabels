import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { ServiceOrdersState } from '../../state/service-orders/service-orders.state';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { ServiceOrdersList } from './pages/service-orders-list/service-orders-list';
import { ServiceOrderBuilder } from './pages/service-order-builder/service-order-builder';
import { ServiceOrderView } from './pages/service-order-view/service-order-view';

/** Service orders (19 §5): list → dedicated builder page (`/new` — decided
 *  2026-07-23, the multi-line builder is too heavy for the shape-3 dialog
 *  idiom) → order view with the activity timeline. */
export default [
  {
    path: '',
    providers: [provideStates([ServiceOrdersState])],
    children: [
      { path: '', component: ServiceOrdersList },
      { path: 'new', component: ServiceOrderBuilder, canDeactivate: [pendingChangesGuard] },
      { path: ':id', component: ServiceOrderView },
    ],
  },
] satisfies Routes;
