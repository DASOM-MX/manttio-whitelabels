import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { Reports } from '../reports/reports';

//import pdfMake from 'pdfmake/build/pdfmake';
//import pdfFonts from 'pdfmake/build/vfs_fonts';

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

//pdfMake.vfs = pdfFonts.pdfMake.vfs;

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

  @ViewChild('pdfContent', { static: false }) pdfContent!: ElementRef;

  downloadPDF() {
    const DATA = this.pdfContent.nativeElement;

    html2canvas(DATA, { scale: 2 }).then(canvas => {
      const imgData = canvas.toDataURL('image/png');

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(imgData);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('reporte.pdf');
    });
  }

  downloadTextPDF() {

    //TODO
    const toBase64 = (url: string) =>
      fetch(url)
        .then(response => response.blob())
        .then(
          blob =>
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            })
        );

    //const imageBase64 = await toBase64(this.report);


  }

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