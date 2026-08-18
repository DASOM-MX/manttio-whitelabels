import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { ServicesState } from '../../state/services/services.state';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { ServicesList } from './pages/services-list/services-list';
import { ServiceForm } from './pages/service-form/service-form';
import { ServiceImport } from './pages/service-import/service-import';

/** Folder is `service-catalog/` rather than `services/` — `app/services/`
 *  already means "injectables" (http/, theme/, table/). The route and the
 *  module key both stay `services`. */
export default [
  {
    path: '',
    providers: [provideStates([ServicesState])],
    children: [
      { path: '', component: ServicesList },
      { path: 'new', component: ServiceForm, canDeactivate: [pendingChangesGuard] },
      // Literal paths before ':id', or the param route would swallow them.
      { path: 'import', component: ServiceImport, canDeactivate: [pendingChangesGuard] },
      // The detail is view-first (static rows, in-page Editar), so it reads
      // as `/services/:id` — no `/edit` suffix.
      { path: ':id', component: ServiceForm, canDeactivate: [pendingChangesGuard] },
    ],
  },
] satisfies Routes;
