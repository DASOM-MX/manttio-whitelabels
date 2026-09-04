import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { PortalUsersState } from '../../state/portal-users/portal-users.state';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { PortalUsersList } from './pages/portal-users-list/portal-users-list';
import { PortalUserDetail } from './pages/portal-user-detail/portal-user-detail';

export default [
  {
    path: '',
    providers: [provideStates([PortalUsersState])],
    children: [
      { path: '', component: PortalUsersList },
      { path: ':id', component: PortalUserDetail, canDeactivate: [pendingChangesGuard] },
    ],
  },
] satisfies Routes;
