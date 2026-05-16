import { Component, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe, SlicePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Store } from '@ngxs/store';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import {
  ClienteOption,
  EstadoOption,
  EstatusOption,
} from '../../interfaces/filter-option';
import { NORTHERN_MEXICAN_STATES } from '../../constants/mexican-states';
import { LoadReports } from '../../store/reports/actions/load-reports';
import { ReportsState } from '../../store/reports/reports';
import { Report } from '../../store/reports/types/report';

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
export class Reports implements OnInit, OnDestroy {
  @ViewChild('dt') dt!: Table;

  private store = inject(Store);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  readonly estadoOptions: EstadoOption[] = NORTHERN_MEXICAN_STATES.map((s) => ({
    label: s,
    value: s,
  }));
  readonly estatusOptions: EstatusOption[] = [
    { label: 'Pendiente', value: false },
    { label: 'Finalizado', value: true },
  ];

  reports = this.store.selectSignal(ReportsState.items);
  total = this.store.selectSignal(ReportsState.total);
  loading = this.store.selectSignal(ReportsState.loading);

  clienteOptions = computed<ClienteOption[]>(() =>
    this.buildClienteOptions(this.reports()),
  );

  filtersOpen = signal(true);

  filtersForm: FormGroup = this.fb.group({
    folio: [''],
    cliente: [null as string | null],
    estado: [null as string | null],
    estatus: [null as boolean | null],
    dateRange: [null as Date[] | null],
  });

  private formValue = toSignal(this.filtersForm.valueChanges, {
    initialValue: this.filtersForm.value,
  });

  activeFilterCount = computed(() => {
    const v = this.formValue();
    let n = 0;
    if (v.folio?.trim()) n++;
    if (v.cliente) n++;
    if (v.estado) n++;
    if (v.estatus !== null && v.estatus !== undefined) n++;
    if (v.dateRange?.[0]) n++;
    return n;
  });

  private destroy$ = new Subject<void>();

  ngOnInit(): void {
    this.store.dispatch(new LoadReports());
    this.wireFilters();
  }

  toggleFilters(): void {
    this.filtersOpen.update((open) => !open);
  }

  private buildClienteOptions(reports: Report[]): ClienteOption[] {
    const seen = new Set<string>();
    const options: ClienteOption[] = [];
    for (const r of reports) {
      const name = r.client_name;
      if (name && !seen.has(name)) {
        seen.add(name);
        options.push({ label: name, value: name });
      }
    }
    return options.sort((a, b) => a.label.localeCompare(b.label));
  }

  private wireFilters(): void {
    const ctrl = this.filtersForm.controls;

    ctrl['folio'].valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((v: string) => this.dt?.filter(v, 'id', 'contains'));

    ctrl['cliente'].valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((v: string | null) => this.dt?.filter(v, 'client_name', 'equals'));

    ctrl['estado'].valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((v: string | null) => this.dt?.filter(v, 'client_state', 'equals'));

    ctrl['estatus'].valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((v: boolean | null) => this.dt?.filter(v, 'report_status', 'equals'));

    ctrl['dateRange'].valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((range: Date[] | null) => {
        if (!range || !range[0]) {
          this.dt?.filter(null, 'date_ts', 'between');
          return;
        }
        const start = new Date(range[0]).setHours(0, 0, 0, 0);
        const end = range[1]
          ? new Date(range[1]).setHours(23, 59, 59, 999)
          : new Date(range[0]).setHours(23, 59, 59, 999);
        this.dt?.filter([start, end], 'date_ts', 'between');
      });
  }

  refresh(): void {
    this.store.dispatch(new LoadReports(true));
  }

  clearFilters() {
    this.filtersForm.reset({
      folio: '',
      cliente: null,
      estado: null,
      estatus: null,
      dateRange: null,
    });
    this.dt?.clear();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  goToReportDetail(reportId: string) {
    this.router.navigate([`/reports/${reportId}`]);
  }
}
