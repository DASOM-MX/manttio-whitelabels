import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
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
import type {
  Customer,
  CustomerListQuery,
  CustomerSource,
  CustomerStatus,
} from '../../../data/dtos/customer';

const PAGE_SIZE = 10;

/** Clients directory (07 §3). The `/customers/leads` and
 *  `/customers/blacklist` nav children reuse this page with a preset status
 *  from route data (locked filter, adjusted heading). Filters + page persist
 *  as GET query params (?q&status&source&tags&page — 05 §3 canon): the
 *  queryParamMap subscription sanitizes and is the single load path, so
 *  browser back/forward walks the filter history. Preset views never
 *  read/write the status param — the preset stays locked. */
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
  private router = inject(Router);

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

  /** Current page (1-based) as read from the URL. */
  private page = 1;
  /** Paginator offset for the table, kept in sync with the URL page. */
  protected first = signal(0);
  protected deleteDialog = viewChild<DeleteCustomerDialog>('deleteDialog');

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
      const search = params.get('q') ?? '';
      const statusParam = params.get('status') ?? '';
      const status = this.presetStatus
        ? this.presetStatus
        : ((statusParam in CUSTOMER_STATUS_LABELS ? statusParam : '') as CustomerStatus | '');
      const sourceParam = params.get('source') ?? '';
      const source = (sourceParam in CUSTOMER_SOURCE_LABELS ? sourceParam : '') as
        | CustomerSource
        | '';
      const tags = (params.get('tags') ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      this.page = page;
      this.first.set((page - 1) * PAGE_SIZE);
      this.search.setValue(search, { emitEvent: false });
      this.statusFilter.setValue(status, { emitEvent: false });
      this.sourceFilter.setValue(source, { emitEvent: false });
      this.tagsFilter.setValue(tags, { emitEvent: false });
      this.store.dispatch(new LoadCustomers(this.query(page)));
    });

    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.applyFilters());
    this.statusFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilters());
    this.sourceFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilters());
    this.tagsFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilters());
  }

  private query(page: number): CustomerListQuery {
    return {
      page,
      limit: PAGE_SIZE,
      search: this.search.value || undefined,
      status: this.statusFilter.value || undefined,
      source: this.sourceFilter.value || undefined,
      tags: this.tagsFilter.value.length ? this.tagsFilter.value : undefined,
    };
  }

  /** Pushes the filter/page state into the URL; the queryParamMap
   *  subscription picks it up and loads. Empty values drop off the URL;
   *  preset views keep `status` out of the URL entirely. */
  private applyFilters(page = 1): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.search.value || null,
        status: this.presetStatus ? null : this.statusFilter.value || null,
        source: this.sourceFilter.value || null,
        tags: this.tagsFilter.value.length ? this.tagsFilter.value.join(',') : null,
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
    if (this.customers().length === 0 && this.page > 1) {
      this.applyFilters(this.page - 1);
      return;
    }
    this.store.dispatch(new LoadCustomers(this.query(this.page)));
  }

  protected openDelete(customer: Customer): void {
    this.deleteDialog()?.open(customer);
  }
}
