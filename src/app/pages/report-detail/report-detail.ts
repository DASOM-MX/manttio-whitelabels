import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-detail.html',
  styleUrl: './report-detail.scss'
})
export class ReportDetail implements OnInit {
  report: any = null;
  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    const folio = this.route.snapshot.paramMap.get('folio');

    this.http.get<any[]>('assets/data.json').subscribe(data => {
      this.report = data.find(r => r.folio === folio);
      this.cdr.detectChanges();
    });
  }
}