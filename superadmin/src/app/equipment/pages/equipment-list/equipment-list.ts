import { Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
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
import type { EquipmentStatus } from '../../../data/dtos/equipment';

const PAGE_SIZE = 10;

/** Global equipment registry (11 §4) — a projection; the daily entry point
 *  is the customer view's equipment card. */
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

  private page = signal(1);
  protected formDialog = viewChild<EquipmentFormDialog>('formDialog');

  constructor() {
    this.store.dispatch(new LoadCustomers({ page: 1, limit: 100 }));
    this.search.valueChanges
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe(() => this.reload(1));
    this.customerFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
    this.statusFilter.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.reload(1));
  }

  protected onLazyLoad(event: TableLazyLoadEvent): void {
    const first = event.first ?? 0;
    const rows = event.rows ?? PAGE_SIZE;
    this.reload(Math.floor(first / rows) + 1, rows);
  }

  protected reload(page = this.page(), limit = PAGE_SIZE): void {
    this.page.set(page);
    this.store.dispatch(
      new LoadEquipment({
        page,
        limit,
        search: this.search.value || undefined,
        customerId: this.customerFilter.value || undefined,
        status: this.statusFilter.value || undefined,
      }),
    );
  }

  protected openCreate(): void {
    this.formDialog()?.open();
  }
}
