import { Component, computed, inject, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { LucideEye, LucidePlus, LucideWrench } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { EquipmentState } from '../../../../state/equipment/equipment.state';
import { LoadEquipment } from '../../../../state/equipment/equipment.actions';
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomers } from '../../../../state/customers/customers.actions';
import { ListQueryService, keyIn } from '../../../services/table/list-query.service';
import { EQUIPMENT_STATUS_LABELS } from '../../../model/constants/equipment/equipment-status-labels.const';
import {
  EquipmentStatusLabelPipe,
  EquipmentStatusSeverityPipe,
} from '../../../pipes/equipment-status.pipe';
import { EquipmentFormDialog } from '../../components/equipment-form-dialog/equipment-form-dialog';
import { FiltersPopover } from '../../../shared/components/filters-popover/filters-popover';
import type { EquipmentListQuery, EquipmentStatus } from '../../../data/dtos/equipment';

/** Global equipment registry (11 §4) — a projection; the daily entry point
 *  is the customer view's equipment card. Filters + page persist as GET
 *  query params (?q&customer&status&page) through ListQueryService (05 §3
 *  canon) — only the param mapping, query building and dispatch live here. */
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
    FiltersPopover,
    LucidePlus,
    LucideEye,
    LucideWrench,
  ],
  providers: [ListQueryService],
  templateUrl: './equipment-list.html',
})
export class EquipmentList {
  private store = inject(Store);
  protected list = inject(ListQueryService);

  protected equipment = select(EquipmentState.items);
  protected total = select(EquipmentState.total);
  protected loading = select(EquipmentState.loading);
  private customers = select(CustomersState.items);

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

  protected formDialog = viewChild<EquipmentFormDialog>('formDialog');

  constructor() {
    this.store.dispatch(new LoadCustomers({ page: 1, limit: 100 }));

    this.list.init({
      read: (params) => {
        this.search.setValue(params.get('q') ?? '', { emitEvent: false });
        this.customerFilter.setValue(params.get('customer') ?? '', { emitEvent: false });
        this.statusFilter.setValue(keyIn(EQUIPMENT_STATUS_LABELS, params.get('status')), {
          emitEvent: false,
        });
      },
      write: () => ({
        q: this.search.value || null,
        customer: this.customerFilter.value || null,
        status: this.statusFilter.value || null,
      }),
      load: (page) => this.store.dispatch(new LoadEquipment(this.query(page))),
    });
    this.list.bindFilters({
      debounced: [this.search],
      instant: [this.customerFilter, this.statusFilter],
    });
  }

  private query(page: number): EquipmentListQuery {
    return {
      page,
      limit: this.list.PAGE_SIZE,
      search: this.search.value || undefined,
      customerId: this.customerFilter.value || undefined,
      status: this.statusFilter.value || undefined,
    };
  }

  /** Refetch the current page (after a create/edit through the dialog). */
  protected refresh(): void {
    this.list.refresh(this.equipment().length);
  }

  protected openCreate(): void {
    this.formDialog()?.open();
  }
}
