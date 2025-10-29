import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { RouterModule } from '@angular/router';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports implements OnInit {
  reports: any[] = [];
  customers: any[] = [];
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
            console.log('Clientes recibidos:', clients);

            this.customers = clients;
            this.cdr.detectChanges();
            // Enlazar nombre del cliente en cada reporte
            this.reports = this.reports.map((report) => ({
              ...report,
              client_name:
                this.customers.find((c) => c.id === report.client_id)?.name ||
                'Desconocido',
            }));
            this.cdr.detectChanges();
          });
      });
  }

  sortReports(criteria: 'date' | 'client-asc' | 'client-desc') {
    if (criteria === 'date') {
      this.reports = [...this.reports].sort(
        (a, b) =>
          new Date(b.date_departure).getTime() -
          new Date(a.date_departure).getTime()
      );
    }
    if (criteria === 'client-asc') {
      this.reports = [...this.reports].sort((a, b) =>
        a.client_name.localeCompare(b.client_name)
      );
    }
    if (criteria === 'client-desc') {
      this.reports = [...this.reports].sort((a, b) =>
        b.client_name.localeCompare(a.client_name)
      );
    }
  }

  goToReportDetail(reportId: string) {
    this.router.navigate([`/reports/${reportId}`]);
  }
}
