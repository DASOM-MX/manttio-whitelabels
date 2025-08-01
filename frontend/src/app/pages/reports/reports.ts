import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { RouterModule } from '@angular/router';




@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './reports.html',
  styleUrl: './reports.scss'
})
export class Reports {
  reports: any[] = [];
  constructor(private http: HttpClient, private cdr: ChangeDetectorRef) {
    this.http.get<any[]>('assets/data.json')
      .subscribe(data => {
        console.log('Datos recibidos:', data);

        this.reports = data;
        this.cdr.detectChanges();

      });
  }


}
