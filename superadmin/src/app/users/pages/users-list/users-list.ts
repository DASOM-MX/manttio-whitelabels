import { Component, inject, signal, viewChild } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import { ROLE_LABELS } from '../../../model/constants/user/role-labels.const';
import { RoleLabelPipe, RoleSeverityPipe } from '../../../pipes/role.pipe';
import { CanManagePipe } from '../../../pipes/access.pipe';
import { DeleteUserDialog } from '../../components/delete-user-dialog/delete-user-dialog';
import type { Role } from '../../../data/dtos/auth';
import type { User, UserListQuery } from '../../../data/dtos/user';

const PAGE_SIZE = 10;

/** Users list (05 §3): lazy server-side table with search/role/active
 *  filters, role + active pills, edit/delete row actions. Owner rows never
 *  show manage actions — owner accounts are immutable in-tenant (14 §2
 *  note 1). Filters + page persist as GET query params (?q&role&active&page)
 *  so browser back/forward walks the filter history; the queryParamMap
 *  subscription is the single load path. */
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
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected users = select(UsersState.items);
  protected total = select(UsersState.total);
  protected loading = select(UsersState.loading);

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

  /** Current page (1-based) as read from the URL. */
  private page = 1;
  /** Paginator offset for the table, kept in sync with the URL page. */
  protected first = signal(0);
  protected deleteDialog = viewChild<DeleteUserDialog>('deleteDialog');

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
      const search = params.get('q') ?? '';
      const roleParam = params.get('role') ?? '';
      const role = (roleParam in ROLE_LABELS ? roleParam : '') as Role | '';
      const activeParam = params.get('active');
      const active = activeParam === 'true' || activeParam === 'false' ? activeParam : '';

      this.page = page;
      this.first.set((page - 1) * PAGE_SIZE);
      this.search.setValue(search, { emitEvent: false });
      this.roleFilter.setValue(role, { emitEvent: false });
      this.activeFilter.setValue(active, { emitEvent: false });
      this.store.dispatch(new LoadUsers(this.query(page)));
    });

    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.applyFilters());
    this.roleFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilters());
    this.activeFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilters());
  }

  private query(page: number): UserListQuery {
    return {
      page,
      limit: PAGE_SIZE,
      search: this.search.value || undefined,
      role: this.roleFilter.value || undefined,
      active: this.activeFilter.value === '' ? undefined : this.activeFilter.value === 'true',
    };
  }

  /** Pushes the filter/page state into the URL; the queryParamMap
   *  subscription picks it up and loads. Empty values drop off the URL. */
  private applyFilters(page = 1): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.search.value || null,
        role: this.roleFilter.value || null,
        active: this.activeFilter.value || null,
        page: page > 1 ? page : null,
      },
    });
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? PAGE_SIZE;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    if (page !== this.page) this.applyFilters(page);
  }

  /** After a delete: step back a page if this one just emptied, else refetch. */
  protected refresh(): void {
    if (this.users().length === 0 && this.page > 1) {
      this.applyFilters(this.page - 1);
      return;
    }
    this.store.dispatch(new LoadUsers(this.query(this.page)));
  }

  protected openDelete(user: User): void {
    this.deleteDialog()?.open(user);
  }
}
