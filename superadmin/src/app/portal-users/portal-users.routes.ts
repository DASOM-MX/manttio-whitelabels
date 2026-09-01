import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { PortalUsersState } from '../../state/portal-users/portal-users.state';
import { PortalUsersList } from './pages/portal-users-list/portal-users-list';

export default [
  {
    path: '',
    providers: [provideStates([PortalUsersState])],
    children: [{ path: '', component: PortalUsersList }],
  },
] satisfies Routes;
