import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Actions, Store, ofActionErrored, ofActionSuccessful, select } from '@ngxs/store';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Table, TableModule } from 'primeng/table';
import { TooltipModule } from 'primeng/tooltip';
import { CustomersState } from '../../../../state/customers/customers.state';
import { DeleteCustomer, LoadCustomers } from '../../../../state/customers/customers.actions';
import { MEXICAN_STATES } from '../../../../data/constants';
import type { CustomerRow } from '../../../data/dtos/customer';

interface CustomerRowVM extends CustomerRow {
  searchHaystack: string;
}

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterModule,
    TableModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TooltipModule,
  ],
  templateUrl: './customers.html',
  styleUrl: './customers.scss',
})
export class Customers {
  @ViewChild('dt') dt!: Table;

  private store = inject(Store);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private actions$ = inject(Actions);
  private confirm = inject(ConfirmationService);
  private messages = inject(MessageService);

  readonly stateOptions = MEXICAN_STATES;

  private customerRows = select(CustomersState.list);
  loading = select(CustomersState.loading);

  customers = computed<CustomerRowVM[]>(() =>
    this.customerRows().map((c) => ({
      ...c,
      searchHaystack: [c.name, c.razonSocial, c.identification, c.email, c.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase(),
    })),
  );

  total = computed(() => this.customers().length);

  filtersOpen = signal(false);

  filtersForm: FormGroup = this.fb.group({
    search: [''],
    state: [null as string | null],
  });

  private formValue = toSignal(this.filtersForm.valueChanges, {
    initialValue: this.filtersForm.value,
  });

  activeFilterCount = computed(() => {
    const v = this.formValue();
    let n = 0;
    if (v.search?.trim()) n++;
    if (v.state) n++;
    return n;
  });

  constructor() {
    this.store.dispatch(new LoadCustomers());
    this.wireFilters();
    this.wireDeleteActionStream();
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
        this.dt?.filter(q, 'searchHaystack', 'contains');
      });

    ctrl['state'].valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v: string | null) => this.dt?.filter(v, 'state', 'equals'));
  }

  private wireDeleteActionStream(): void {
    this.actions$
      .pipe(ofActionSuccessful(DeleteCustomer), takeUntilDestroyed())
      .subscribe(() => {
        this.messages.add({ severity: 'success', summary: 'Cliente eliminado' });
      });

    this.actions$
      .pipe(ofActionErrored(DeleteCustomer), takeUntilDestroyed())
      .subscribe(() => {
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo eliminar el cliente',
        });
      });
  }

  clearFilters(): void {
    this.filtersForm.reset({ search: '', state: null });
    this.dt?.clear();
  }

  goToEdit(id: string): void {
    this.router.navigate(['/customers', id, 'edit']);
  }

  askDelete(event: Event, row: CustomerRow): void {
    event.stopPropagation();
    this.confirm.confirm({
      header: '¿Eliminar cliente?',
      message: `Se archivará "${row.name}". Los reportes existentes conservarán su referencia.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.store.dispatch(new DeleteCustomer(row.id));
      },
    });
  }
}
