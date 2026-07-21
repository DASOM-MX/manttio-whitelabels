import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { CmsState } from '../../state/cms/cms.state';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { HomeEditor } from './pages/home-editor/home-editor';
import { ClientsEditor } from './pages/clients-editor/clients-editor';

export default [
  {
    path: '',
    providers: [provideStates([CmsState])],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      { path: 'home', component: HomeEditor, canDeactivate: [pendingChangesGuard] },
      { path: 'clients', component: ClientsEditor, canDeactivate: [pendingChangesGuard] },
    ],
  },
] satisfies Routes;
