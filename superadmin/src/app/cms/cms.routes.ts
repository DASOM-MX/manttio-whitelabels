import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { CmsState } from '../../state/cms/cms.state';
import { CustomerStatsState } from '../../state/customer-stats/customer-stats.state';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { CmsDashboard } from './pages/dashboard/dashboard';
import { HomeEditor } from './pages/home-editor/home-editor';
import { ClientsEditor } from './pages/clients-editor/clients-editor';

export default [
  {
    path: '',
    providers: [provideStates([CmsState, CustomerStatsState])],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      // Read-only page — no pendingChangesGuard (utm-params 03 CP-2).
      { path: 'dashboard', component: CmsDashboard },
      { path: 'home', component: HomeEditor, canDeactivate: [pendingChangesGuard] },
      { path: 'clients', component: ClientsEditor, canDeactivate: [pendingChangesGuard] },
    ],
  },
] satisfies Routes;
