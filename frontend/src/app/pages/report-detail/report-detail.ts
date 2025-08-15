import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { Reports } from '../reports/reports';

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-detail.html',
  styleUrl: './report-detail.scss'
})
export class ReportDetail implements OnInit {
  report: any = null;
  customer: any = null;
  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
  ) { }

  ngOnInit(): void {


    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.http.get(`http://localhost:3000/reports/${id}`, {
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }

      }).subscribe(data => {
        this.report = data;
        this.cdr.detectChanges();
        console.log(data)


        this.http.get<any[]>(`http://localhost:3000/customers/${this.report.client_id}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }).subscribe(clients => {
          console.log('Cliente unico recibido:', clients);

          this.customer = clients;
          this.cdr.detectChanges();

        });

      })
    }

  }
}