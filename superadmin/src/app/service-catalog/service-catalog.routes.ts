import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { ServicesState } from '../../state/services/services.state';
import { ServicesList } from './pages/services-list/services-list';

/** Folder is `service-catalog/` rather than `services/` — `app/services/`
 *  already means "injectables" (http/, theme/, table/). The route and the
 *  module key both stay `services`. */
export default [
  {
    path: '',
    providers: [provideStates([ServicesState])],
    children: [{ path: '', component: ServicesList }],
  },
] satisfies Routes;
