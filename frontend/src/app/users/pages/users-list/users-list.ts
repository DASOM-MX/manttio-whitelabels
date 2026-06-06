import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Store, select } from '@ngxs/store';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { LoadCurrentUser, LoadUsers } from '../../../../state/users/users.actions';
import { UsersState } from '../../../../state/users/users.state';
import type { UserType } from '../../../data/types/user';
import { DeleteUserDialog } from '../../components/delete-user-dialog/delete-user-dialog';
import { ROLE_LABELS, ROLE_OPTIONS } from '../../constants/roles';
import type { UserRowVM } from '../../types/user-row-vm';

@Component({
  selector: 'app-users-list',
  standalone: true,
  imports: [
    DatePipe,
    ReactiveFormsModule,
    RouterModule,
    TableModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TooltipModule,
    DeleteUserDialog,
  ],
  templateUrl: './users-list.html',
  styleUrl: './users-list.scss',
})
export class UsersList {
  private dt = viewChild<Table>('dt');
  private deleteDialog = viewChild<DeleteUserDialog>('deleteDialog');

  private store = inject(Store);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  readonly roleOptions = ROLE_OPTIONS;

  private userRows = select(UsersState.list);
  me = select(UsersState.me);
  loading = select(UsersState.loading);

  users = computed<UserRowVM[]>(() => {
    const meId = this.me()?.id ?? null;
    return this.userRows().map((u) => ({
      ...u,
      roleLabel: ROLE_LABELS[u.role],
      isSelf: u.id === meId,
      searchHaystack: [u.name, u.email, ROLE_LABELS[u.role]]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    }));
  });

  total = computed(() => this.users().length);

  filtersOpen = signal(false);

  filtersForm: FormGroup = this.fb.group({
    search: [''],
    role: [null as UserType | null],
  });

  private formValue = toSignal(this.filtersForm.valueChanges, {
    initialValue: this.filtersForm.value,
  });

  activeFilterCount = computed(() => {
    const v = this.formValue();
    let n = 0;
    if (v.search?.trim()) n++;
    if (v.role) n++;
    return n;
  });

  constructor() {
    this.store.dispatch(new LoadUsers());
    if (!this.me()) this.store.dispatch(new LoadCurrentUser());
    this.wireFilters();
  }

  toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
  }

  private wireFilters(): void {
    const ctrl = this.filtersForm.controls;

    ctrl['search'].valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v: string | null) => {
        const q = (v ?? '').trim().toLowerCase();
        this.dt()?.filter(q, 'searchHaystack', 'contains');
      });

    ctrl['role'].valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v: UserType | null) => this.dt()?.filter(v, 'role', 'equals'));
  }

  clearFilters(): void {
    this.filtersForm.reset({ search: '', role: null });
    this.dt()?.clear();
  }

  goToEdit(id: string): void {
    this.router.navigate(['/users', id, 'edit']);
  }

  askDelete(event: Event, row: UserRowVM): void {
    event.stopPropagation();
    this.deleteDialog()?.open(row);
  }
}
