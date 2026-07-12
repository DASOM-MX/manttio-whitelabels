import { Routes } from '@angular/router';
import { provideStates } from '@ngxs/store';
import { UsersState } from '../../state/users/users.state';
import { pendingChangesGuard } from '../guards/pending-changes.guard';
import { UsersList } from './pages/users-list/users-list';
import { UserForm } from './pages/user-form/user-form';

export default [
  {
    path: '',
    providers: [provideStates([UsersState])],
    children: [
      { path: '', component: UsersList },
      { path: 'new', component: UserForm, canDeactivate: [pendingChangesGuard] },
      { path: ':id/edit', component: UserForm, canDeactivate: [pendingChangesGuard] },
    ],
  },
] satisfies Routes;
