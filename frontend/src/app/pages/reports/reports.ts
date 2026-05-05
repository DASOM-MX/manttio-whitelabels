import { Component, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';

interface ClienteOption {
  label: string;
  value: string;
}

interface EstadoOption {
  label: string;
  value: string;
}

interface EstatusOption {
  label: string;
  value: boolean;
}

const NORTHERN_MEXICAN_STATES = [
  'Baja California',
  'Baja California Sur',
  'Chihuahua',
  'Coahuila',
  'Durango',
  'Nuevo León',
  'Sinaloa',
  'Sonora',
  'Tamaulipas',
];

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
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
export class Reports implements OnInit {
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

  folioQuery = '';
  selectedCliente: string | null = null;
  selectedEstado: string | null = null;
  selectedEstatus: boolean | null = null;
  selectedDateRange: Date[] | null = null;
  filtersOpen = true;

  get activeFilterCount(): number {
    let n = 0;
    if (this.folioQuery?.trim()) n++;
    if (this.selectedCliente) n++;
    if (this.selectedEstado) n++;
    if (this.selectedEstatus !== null && this.selectedEstatus !== undefined) n++;
    if (this.selectedDateRange?.[0]) n++;
    return n;
  }

  constructor(
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
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

  onFolioFilter(value: string) {
    this.folioQuery = value;
    this.dt.filter(value, 'id', 'contains');
  }

  onClienteFilter(value: string | null) {
    this.dt.filter(value, 'client_name', 'equals');
  }

  onEstadoFilter(value: string | null) {
    this.dt.filter(value, 'client_state', 'equals');
  }

  onEstatusFilter(value: boolean | null) {
    this.dt.filter(value, 'report_status', 'equals');
  }

  onDateRangeFilter(range: Date[] | null) {
    if (!range || !range[0]) {
      this.dt.filter(null, 'date_ts', 'between');
      return;
    }
    const start = new Date(range[0]).setHours(0, 0, 0, 0);
    const end = range[1]
      ? new Date(range[1]).setHours(23, 59, 59, 999)
      : new Date(range[0]).setHours(23, 59, 59, 999);
    this.dt.filter([start, end], 'date_ts', 'between');
  }

  clearFilters() {
    this.folioQuery = '';
    this.selectedCliente = null;
    this.selectedEstado = null;
    this.selectedEstatus = null;
    this.selectedDateRange = null;
    this.dt.clear();
  }

  goToReportDetail(reportId: string) {
    this.router.navigate([`/reports/${reportId}`]);
  }
}
