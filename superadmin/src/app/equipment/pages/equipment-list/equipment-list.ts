import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import { TableModule, TableLazyLoadEvent } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { LucideEye, LucidePlus, LucideWrench } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { EquipmentState } from '../../../../state/equipment/equipment.state';
import { LoadEquipment } from '../../../../state/equipment/equipment.actions';
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomers } from '../../../../state/customers/customers.actions';
import { EQUIPMENT_STATUS_LABELS } from '../../../model/constants/equipment/equipment-status-labels.const';
import {
  EquipmentStatusLabelPipe,
  EquipmentStatusSeverityPipe,
} from '../../../pipes/equipment-status.pipe';
import { EquipmentFormDialog } from '../../components/equipment-form-dialog/equipment-form-dialog';
import type { EquipmentListQuery, EquipmentStatus } from '../../../data/dtos/equipment';

const PAGE_SIZE = 10;

/** Global equipment registry (11 §4) — a projection; the daily entry point
 *  is the customer view's equipment card. Filters + page persist as GET
 *  query params (?q&customer&status&page — 05 §3 canon): the queryParamMap
 *  subscription sanitizes and is the single load path, so browser
 *  back/forward walks the filter history. */
@Component({
  selector: 'app-equipment-list',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    TagModule,
    EquipmentStatusLabelPipe,
    EquipmentStatusSeverityPipe,
    EquipmentFormDialog,
    LucidePlus,
    LucideEye,
    LucideWrench,
  ],
  templateUrl: './equipment-list.html',
})
export class EquipmentList {
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  protected equipment = select(EquipmentState.items);
  protected total = select(EquipmentState.total);
  protected loading = select(EquipmentState.loading);
  private customers = select(CustomersState.items);

  protected readonly PAGE_SIZE = PAGE_SIZE;

  protected search = new FormControl('', { nonNullable: true });
  protected customerFilter = new FormControl('', { nonNullable: true });
  protected statusFilter = new FormControl<EquipmentStatus | ''>('', { nonNullable: true });

  protected customerOptions = computed(() => [
    { label: 'Todos los clientes', value: '' },
    ...this.customers().map((c) => ({ label: c.name, value: c.id })),
  ]);
  protected statusOptions = [
    { label: 'Todos los estados', value: '' },
    ...(Object.entries(EQUIPMENT_STATUS_LABELS) as [EquipmentStatus, string][]).map(
      ([value, label]) => ({ label, value }),
    ),
  ];

  /** Current page (1-based) as read from the URL. */
  private page = 1;
  /** Paginator offset for the table, kept in sync with the URL page. */
  protected first = signal(0);
  protected formDialog = viewChild<EquipmentFormDialog>('formDialog');

  constructor() {
    this.store.dispatch(new LoadCustomers({ page: 1, limit: 100 }));

    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
      const search = params.get('q') ?? '';
      const customer = params.get('customer') ?? '';
      const statusParam = params.get('status') ?? '';
      const status = (
        statusParam in EQUIPMENT_STATUS_LABELS ? statusParam : ''
      ) as EquipmentStatus | '';

      this.page = page;
      this.first.set((page - 1) * PAGE_SIZE);
      this.search.setValue(search, { emitEvent: false });
      this.customerFilter.setValue(customer, { emitEvent: false });
      this.statusFilter.setValue(status, { emitEvent: false });
      this.store.dispatch(new LoadEquipment(this.query(page)));
    });

    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.applyFilters());
    this.customerFilter.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.applyFilters());
    this.statusFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.applyFilters());
  }

  private query(page: number): EquipmentListQuery {
    return {
      page,
      limit: PAGE_SIZE,
      search: this.search.value || undefined,
      customerId: this.customerFilter.value || undefined,
      status: this.statusFilter.value || undefined,
    };
  }

  /** Pushes the filter/page state into the URL; the queryParamMap
   *  subscription picks it up and loads. Empty values drop off the URL. */
  private applyFilters(page = 1): void {
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.search.value || null,
        customer: this.customerFilter.value || null,
        status: this.statusFilter.value || null,
        page: page > 1 ? page : null,
      },
    });
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const rows = event.rows ?? PAGE_SIZE;
    const page = Math.floor((event.first ?? 0) / rows) + 1;
    if (page !== this.page) this.applyFilters(page);
  }

  /** Refetch the current page (after a create/edit through the dialog). */
  protected refresh(): void {
    this.store.dispatch(new LoadEquipment(this.query(this.page)));
  }

  protected openCreate(): void {
    this.formDialog()?.open();
  }
}
