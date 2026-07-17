import { Component, computed, inject, viewChild } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
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
import { ListQueryService, keyIn } from '../../../services/table/list-query.service';
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

/** Clients directory (07 §3). The `/customers/leads` and
 *  `/customers/blacklist` nav children reuse this page with a preset status
 *  from route data (locked filter, adjusted heading). Filters + page persist
 *  as GET query params (?q&status&source&tags&page) through ListQueryService
 *  (05 §3 canon) — only the param mapping, query building and dispatch live
 *  here. Preset views never read/write the status param — the preset stays
 *  locked. */
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
  providers: [ListQueryService],
  templateUrl: './customers-list.html',
})
export class CustomersList {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  protected list = inject(ListQueryService);

  protected customers = select(CustomersState.items);
  protected total = select(CustomersState.total);
  protected loading = select(CustomersState.loading);
  protected knownTags = select(CustomersState.knownTags);

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

  protected deleteDialog = viewChild<DeleteCustomerDialog>('deleteDialog');

  constructor() {
    this.list.init({
      read: (params) => {
        const status = this.presetStatus || keyIn(CUSTOMER_STATUS_LABELS, params.get('status'));
        const tags = (params.get('tags') ?? '')
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.statusFilter.setValue(status, { emitEvent: false });
        this.sourceFilter.setValue(keyIn(CUSTOMER_SOURCE_LABELS, params.get('source')), {
          emitEvent: false,
        });
        this.tagsFilter.setValue(tags, { emitEvent: false });
      },
      write: () => ({
        q: this.search.value || null,
        // Preset views keep `status` out of the URL — the preset stays locked.
        status: this.presetStatus ? null : this.statusFilter.value || null,
        source: this.sourceFilter.value || null,
        tags: this.tagsFilter.value.length ? this.tagsFilter.value.join(',') : null,
      }),
      load: (page) => this.store.dispatch(new LoadCustomers(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.statusFilter, this.sourceFilter, this.tagsFilter],
    });
  }

  private query(page: number): CustomerListQuery {
    return {
      page,
      limit: this.list.PAGE_SIZE,
      search: this.search.value || undefined,
      status: this.statusFilter.value || undefined,
      source: this.sourceFilter.value || undefined,
      tags: this.tagsFilter.value.length ? this.tagsFilter.value : undefined,
    };
  }

  protected refresh(): void {
    this.list.refresh(this.customers().length);
  }

  protected openDelete(customer: Customer): void {
    this.deleteDialog()?.open(customer);
  }

  /** Whole row clicks through to the client 360 view (05 §3 QA pattern); the
   *  action links remain the keyboard path. */
  protected openCustomer(customer: Customer): void {
    this.router.navigate(['/customers', customer.id]);
  }
}
