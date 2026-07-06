import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { LucidePencil, LucidePlus, LucideTrash2, LucideUsers } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { UsersState } from '../../../../state/users/users.state';
import { LoadUsers } from '../../../../state/users/users.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { ROLE_LABELS } from '../../user-labels';
import { RoleLabelPipe, RoleSeverityPipe } from '../../../pipes/role.pipe';
import { CanManagePipe } from '../../../pipes/access.pipe';
import { DeleteUserDialog } from '../../components/delete-user-dialog/delete-user-dialog';
import type { Role } from '../../../data/dtos/auth';
import type { User } from '../../../data/dtos/user';

const PAGE_SIZE = 10;

/** Users list (05 §3): lazy server-side table with search/role/active
 *  filters, role + active pills, edit/delete row actions. Owner rows hide
 *  manage actions from admins (owner protection, 14 §2 note 1). */
@Component({
  selector: 'app-users-list',
  imports: [
    SlicePipe,
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    TagModule,
    RoleLabelPipe,
    RoleSeverityPipe,
    CanManagePipe,
    DeleteUserDialog,
    LucidePlus,
    LucidePencil,
    LucideTrash2,
    LucideUsers,
  ],
  templateUrl: './users-list.html',
})
export class UsersList {
  private store = inject(Store);

  protected users = select(UsersState.items);
  protected total = select(UsersState.total);
  protected loading = select(UsersState.loading);
  private me = select(AuthState.me);
  /** Actor role for the row-level canManage pipe (owner protection). */
  protected myRole = computed(() => this.me()?.role ?? null);

  protected readonly PAGE_SIZE = PAGE_SIZE;

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

  private page = signal(1);
  protected deleteDialog = viewChild<DeleteUserDialog>('deleteDialog');

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reload(1));
    this.roleFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
    this.activeFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? PAGE_SIZE;
    this.reload(Math.floor(first / rows) + 1, rows);
  }

  protected reload(page = this.page(), limit = PAGE_SIZE): void {
    this.page.set(page);
    this.store.dispatch(
      new LoadUsers({
        page,
        limit,
        search: this.search.value || undefined,
        role: this.roleFilter.value || undefined,
        active: this.activeFilter.value === '' ? undefined : this.activeFilter.value === 'true',
      }),
    );
  }

  protected openDelete(user: User): void {
    this.deleteDialog()?.open(user);
  }
}
