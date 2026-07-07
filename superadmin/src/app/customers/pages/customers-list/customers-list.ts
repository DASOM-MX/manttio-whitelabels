import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import {
  LucideBuilding2,
  LucideEye,
  LucidePencil,
  LucidePlus,
  LucideTrash2,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomers } from '../../../../state/customers/customers.actions';
import { CUSTOMER_STATUS_LABELS } from '../../../model/constants/customer/customer-status-labels.const';
import { CUSTOMER_SOURCE_LABELS } from '../../../model/constants/customer/customer-source-labels.const';
import {
  CustomerSourceLabelPipe,
  CustomerStatusLabelPipe,
  CustomerStatusSeverityPipe,
} from '../../../pipes/customer-status.pipe';
import { DeleteCustomerDialog } from '../../components/delete-customer-dialog/delete-customer-dialog';
import type { Customer, CustomerSource, CustomerStatus } from '../../../data/dtos/customer';

const PAGE_SIZE = 10;

/** Clients directory (07 §3). The `/customers/leads` and
 *  `/customers/blacklist` nav children reuse this page with a preset status
 *  from route data (locked filter, adjusted heading). */
@Component({
  selector: 'app-customers-list',
  imports: [
    SlicePipe,
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    MultiSelectModule,
    InputTextModule,
    TagModule,
    CustomerStatusLabelPipe,
    CustomerStatusSeverityPipe,
    CustomerSourceLabelPipe,
    DeleteCustomerDialog,
    LucidePlus,
    LucideEye,
    LucidePencil,
    LucideTrash2,
    LucideBuilding2,
  ],
  templateUrl: './customers-list.html',
})
export class CustomersList {
  private store = inject(Store);
  private route = inject(ActivatedRoute);

  protected customers = select(CustomersState.items);
  protected total = select(CustomersState.total);
  protected loading = select(CustomersState.loading);
  protected knownTags = select(CustomersState.knownTags);

  protected readonly PAGE_SIZE = PAGE_SIZE;

  /** Preset from route data (leads / blacklist views). */
  protected presetStatus: CustomerStatus | '' =
    (this.route.snapshot.data['presetStatus'] as CustomerStatus | undefined) ?? '';
  protected title: string = this.route.snapshot.data['title'] ?? 'Clientes';

  protected search = new FormControl('', { nonNullable: true });
  protected statusFilter = new FormControl<CustomerStatus | ''>(this.presetStatus, {
    nonNullable: true,
  });
  protected sourceFilter = new FormControl<CustomerSource | ''>('', { nonNullable: true });
  protected tagsFilter = new FormControl<string[]>([], { nonNullable: true });

  protected statusOptions = [
    { label: 'Todos los estados', value: '' },
    ...(Object.entries(CUSTOMER_STATUS_LABELS) as [CustomerStatus, string][]).map(
      ([value, label]) => ({ label, value }),
    ),
  ];
  protected sourceOptions = [
    { label: 'Todos los orígenes', value: '' },
    ...(Object.entries(CUSTOMER_SOURCE_LABELS) as [CustomerSource, string][]).map(
      ([value, label]) => ({ label, value }),
    ),
  ];
  protected tagOptions = computed(() => this.knownTags().map((t) => ({ label: t, value: t })));

  private page = signal(1);
  protected deleteDialog = viewChild<DeleteCustomerDialog>('deleteDialog');

  constructor() {
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reload(1));
    this.statusFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
    this.sourceFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
    this.tagsFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? PAGE_SIZE;
    this.reload(Math.floor(first / rows) + 1, rows);
  }

  protected reload(page = this.page(), limit = PAGE_SIZE): void {
    this.page.set(page);
    this.store.dispatch(
      new LoadCustomers({
        page,
        limit,
        search: this.search.value || undefined,
        status: this.statusFilter.value || undefined,
        source: this.sourceFilter.value || undefined,
        tags: this.tagsFilter.value.length ? this.tagsFilter.value : undefined,
      }),
    );
  }

  protected openDelete(customer: Customer): void {
    this.deleteDialog()?.open(customer);
  }
}
