import { Component, inject, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { LucideEye, LucidePencil, LucidePlus, LucideTrash2, LucideUsers } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { UsersState } from '../../../../state/users/users.state';
import { LoadUsers } from '../../../../state/users/users.actions';
import { ListQueryService, keyIn } from '../../../services/table/list-query.service';
import { ROLE_LABELS } from '../../../model/constants/user/role-labels.const';
import { RoleLabelPipe, RolePillClassPipe } from '../../../pipes/role.pipe';
import { CanManagePipe } from '../../../pipes/access.pipe';
import { DeleteUserDialog } from '../../components/delete-user-dialog/delete-user-dialog';
import type { Role } from '../../../data/dtos/auth';
import type { User, UserListQuery } from '../../../data/dtos/user';

/** Users list (05 §3): lazy server-side table with search/role/active
 *  filters, role + active pills, edit/delete row actions. Owner rows never
 *  show manage actions — owner accounts are immutable in-tenant (14 §2
 *  note 1). Filters + page persist as GET query params (?q&role&active&page)
 *  through ListQueryService (05 §3 canon) — only the param mapping, query
 *  building and dispatch live here. */
@Component({
  selector: 'app-users-list',
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    TagModule,
    RoleLabelPipe,
    RolePillClassPipe,
    CanManagePipe,
    DeleteUserDialog,
    LucidePlus,
    LucidePencil,
    LucideTrash2,
    LucideUsers,
    LucideEye,
  ],
  providers: [ListQueryService],
  templateUrl: './users-list.html',
})
export class UsersList {
  private store = inject(Store);
  private router = inject(Router);
  protected list = inject(ListQueryService);

  protected users = select(UsersState.items);
  protected total = select(UsersState.total);
  protected loading = select(UsersState.loading);

  protected search = new FormControl('', { nonNullable: true });
  protected roleFilter = new FormControl<Role | ''>('', { nonNullable: true });
  protected activeFilter = new FormControl<'' | 'true' | 'false'>('', { nonNullable: true });

  protected roleOptions = [
    { label: 'Todos los roles', value: '' },
    ...(Object.entries(ROLE_LABELS) as [Role, string][]).map(([value, label]) => ({
      label,
      value,
    })),
  ];
  protected activeOptions = [
    { label: 'Todos', value: '' },
    { label: 'Activos', value: 'true' },
    { label: 'Inactivos', value: 'false' },
  ];

  protected deleteDialog = viewChild<DeleteUserDialog>('deleteDialog');

  constructor() {
    this.list.init({
      read: (params) => {
        const active = params.get('active');
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.roleFilter.setValue(keyIn(ROLE_LABELS, params.get('role')), { emitEvent: false });
        this.activeFilter.setValue(active === 'true' || active === 'false' ? active : '', {
          emitEvent: false,
        });
      },
      write: () => ({
        q: this.search.value || null,
        role: this.roleFilter.value || null,
        active: this.activeFilter.value || null,
      }),
      load: (page) => this.store.dispatch(new LoadUsers(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.roleFilter, this.activeFilter],
    });
  }

  private query(page: number): UserListQuery {
    return {
      page,
      limit: this.list.PAGE_SIZE,
      search: this.search.value || undefined,
      role: this.roleFilter.value || undefined,
      active: this.activeFilter.value === '' ? undefined : this.activeFilter.value === 'true',
    };
  }

  protected refresh(): void {
    this.list.refresh(this.users().length);
  }

  protected openDelete(user: User): void {
    this.deleteDialog()?.open(user);
  }

  /** Row click → user details (QA 2026-07-08); owner pages open read-only. */
  protected openUser(user: User): void {
    this.router.navigate(['/users', user.id, 'edit']);
  }
}
