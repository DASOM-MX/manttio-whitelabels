import { Component, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, SlicePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Store, select } from '@ngxs/store';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { ClienteOption, EstatusOption } from '../../../interfaces/filter-option';
import { LoadReports } from '../../../../state/reports/reports.actions';
import { ReportsState } from '../../../../state/reports/reports.state';
import { LoadCustomers } from '../../../../state/customers/customers.actions';
import { CustomersState } from '../../../../state/customers/customers.state';
import { OfflineReportsState } from '../../../../state/offline-reports/offline-reports.state';
import type { ReportRow } from '../../../data/dtos/report';
import type { ReportStatus } from '../../../data/types/report';
import { MEXICAN_STATES } from '../../../data/constants';

type ReportListBucket = 'pending' | 'done';

interface ReportRowVM extends ReportRow {
  clientName: string;
  dateTs: number;
  bucket: ReportListBucket;
}

const STATUS_BUCKET: Record<ReportStatus, ReportListBucket> = {
  created: 'pending',
  'in-progress': 'pending',
  finished: 'done',
  mailed: 'done',
};

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    DatePipe,
    SlicePipe,
    ReactiveFormsModule,
    RouterModule,
    TableModule,
    TagModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    DatePickerModule,
  ],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  @ViewChild('dt') dt!: Table;

  private store = inject(Store);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  readonly estatusOptions: EstatusOption[] = [
    { label: 'Pendiente', value: 'pending' },
    { label: 'Finalizado', value: 'done' },
  ];

  readonly stateOptions = MEXICAN_STATES;

  private reportRows = select(ReportsState.list);
  private customerRows = select(CustomersState.list);
  private pendingRows = select(OfflineReportsState.pending);
  loading = select(ReportsState.loading);

  private customerNameById = computed(() => {
    const map = new Map<string, string>();
    for (const c of this.customerRows()) map.set(c.id, c.name);
    return map;
  });

  reports = computed<ReportRowVM[]>(() => {
    const names = this.customerNameById();
    return this.reportRows().map((r) => {
      const ts = r.dateDeparture ? new Date(r.dateDeparture).getTime() : 0;
      return {
        ...r,
        clientName: names.get(r.clientId) ?? 'Desconocido',
        dateTs: ts,
        bucket: STATUS_BUCKET[r.status],
      };
    });
  });

  total = computed(() => this.reports().length);

  /** Offline-created reports awaiting upload — pinned above the table for emphasis. */
  pendingReports = computed(() => {
    const names = this.customerNameById();
    return this.pendingRows().map((p) => ({
      ...p,
      clientName: names.get(p.clientId) ?? 'Cliente',
    }));
  });

  clienteOptions = computed<ClienteOption[]>(() => {
    const seen = new Set<string>();
    const options: ClienteOption[] = [];
    for (const r of this.reports()) {
      if (r.clientName && !seen.has(r.clientName)) {
        seen.add(r.clientName);
        options.push({ label: r.clientName, value: r.clientName });
      }
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  });

  filtersOpen = signal(false);

  filtersForm: FormGroup = this.fb.group({
    cliente: [null as string | null],
    estatus: [null as ReportListBucket | null],
    state: [null as string | null],
    dateRange: [null as Date[] | null],
  });

  private formValue = toSignal(this.filtersForm.valueChanges, {
    initialValue: this.filtersForm.value,
  });

  activeFilterCount = computed(() => {
    const v = this.formValue();
    let n = 0;
    if (v.cliente) n++;
    if (v.estatus !== null && v.estatus !== undefined) n++;
    if (v.state) n++;
    if (v.dateRange?.[0]) n++;
    return n;
  });

  constructor() {
    this.store.dispatch(new LoadReports());
    this.store.dispatch(new LoadCustomers());
    this.wireFilters();
  }

  toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
  }

  private wireFilters(): void {
    const ctrl = this.filtersForm.controls;

    ctrl['cliente'].valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v: string | null) => this.dt?.filter(v, 'clientName', 'equals'));

    ctrl['estatus'].valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v: ReportListBucket | null) => this.dt?.filter(v, 'bucket', 'equals'));

    ctrl['state'].valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((v: string | null) => this.dt?.filter(v, 'state', 'equals'));

    ctrl['dateRange'].valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((range: Date[] | null) => {
        if (!range || !range[0]) {
          this.dt?.filter(null, 'dateTs', 'between');
          return;
        }
        const start = new Date(range[0]).setHours(0, 0, 0, 0);
        const end = range[1]
          ? new Date(range[1]).setHours(23, 59, 59, 999)
          : new Date(range[0]).setHours(23, 59, 59, 999);
        this.dt?.filter([start, end], 'dateTs', 'between');
      });
  }

  refresh(): void {
    this.store.dispatch(new LoadReports());
    this.store.dispatch(new LoadCustomers());
  }

  clearFilters() {
    this.filtersForm.reset({
      cliente: null,
      estatus: null,
      state: null,
      dateRange: null,
    });
    this.dt?.clear();
  }

  goToReportDetail(reportId: string) {
    this.router.navigate([`/reports/${reportId}`]);
  }

  goToPendingDetail(tempId: string) {
    this.router.navigate(['/report/pending', tempId]);
  }
}
