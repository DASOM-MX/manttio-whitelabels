import { Component, OnDestroy, OnInit, ViewChild, inject } from '@angular/core';
import { DatePipe, SlicePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { environment } from '../../../environments/environment';
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

  reports: any[] = [];
  customers: any[] = [];

  clienteOptions: ClienteOption[] = [];
  estadoOptions: EstadoOption[] = NORTHERN_MEXICAN_STATES.map((s) => ({
    label: s,
    value: s,
  }));
  estatusOptions: EstatusOption[] = [
    { label: 'Pendiente', value: false },
    { label: 'Finalizado', value: true },
  ];

  filtersOpen = true;

  private http = inject(HttpClient);
  private cdr = inject(ChangeDetectorRef);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  filtersForm: FormGroup = this.fb.group({
    folio: [''],
    cliente: [null as string | null],
    estado: [null as string | null],
    estatus: [null as boolean | null],
    dateRange: [null as Date[] | null],
  });

  private destroy$ = new Subject<void>();

  get activeFilterCount(): number {
    const v = this.filtersForm.value;
    let n = 0;
    if (v.folio?.trim()) n++;
    if (v.cliente) n++;
    if (v.estado) n++;
    if (v.estatus !== null && v.estatus !== undefined) n++;
    if (v.dateRange?.[0]) n++;
    return n;
  }

  ngOnInit(): void {
    this.wireFilters();
    this.http
      .get<any[]>(`${environment.apiUrl}reports`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
        },
      })
      .subscribe((reports) => {
        this.reports = reports;
        this.cdr.detectChanges();

        this.http
          .get<any[]>(`${environment.apiUrl}customers`, {
            headers: {
              Authorization: `Bearer ${localStorage.getItem('token')}`,
            },
          })
          .subscribe((clients) => {
            this.customers = clients;
            this.cdr.detectChanges();
            // Annotate every report with the client name so the table can
            // filter / sort / display it as a first-class column. We also
            // pre-compute date_ts so the date-range filter can use a numeric
            // `between` constraint without per-row Date parsing.
            this.reports = this.reports.map((report) => {
              const customer = this.customers.find(
                (c) => c.id === report.client_id
              );
              return {
                ...report,
                client_name: customer?.name || 'Desconocido',
                client_state: customer?.state || '',
                date_ts: report.date_departure
                  ? new Date(report.date_departure).getTime()
                  : 0,
              };
            });
            this.clienteOptions = this.buildClienteOptions(this.reports);
            this.cdr.detectChanges();
          });
      });
  }

  private buildClienteOptions(reports: any[]): ClienteOption[] {
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
      .subscribe((v: string | null) =>
        this.dt?.filter(v, 'client_name', 'equals')
      );

    ctrl['estado'].valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((v: string | null) =>
        this.dt?.filter(v, 'client_state', 'equals')
      );

    ctrl['estatus'].valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((v: boolean | null) =>
        this.dt?.filter(v, 'report_status', 'equals')
      );

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
