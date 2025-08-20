import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { Reports } from '../reports/reports';
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
pdfMake.vfs = pdfFonts.vfs;

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

  // async toBase64(url: string): Promise<string | null> {
  //   try {
  //     const res = await fetch(url, { mode: "cors" });
  //     if (!res.ok) {
  //       console.error(`Error al obtener la imagen: ${url}`, res.status)
  //       return null;
  //     }
  //     const blob = await res.blob();
  //     return new Promise<string>((resolve, reject) => {
  //       const reader = new FileReader();
  //       reader.onloadend = () => resolve(reader.result as string);
  //       reader.onerror = reject;
  //       reader.readAsDataURL(blob);
  //     });
  //   } catch (err) {
  //     console.log("Error en tobase64", err)
  //     return null;
  //   }

  // }

  async toBase64(url: string): Promise<string> {
    console.log("🔎 Intentando convertir a Base64:", url);

    try {
      const res = await fetch(url);

      console.log("📡 Response:", {
        url: res.url,
        status: res.status,
        ok: res.ok,
        headers: Object.fromEntries(res.headers.entries())
      });

      if (!res.ok) {
        throw new Error(`❌ Error HTTP ${res.status}`);
      }

      const blob = await res.blob();
      console.log("📦 Blob generado:", { size: blob.size, type: blob.type });

      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          console.log("✅ Base64 convertido (longitud):", (reader.result as string).length);
          resolve(reader.result as string);
        };
        reader.onerror = (err) => {
          console.error("❌ Error al leer Blob:", err);
          reject(err);
        };
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error("🔥 Error en toBase64 para", url, err);
      throw err;
    }
  }

  getTableForReportType(reportType: string) {
    switch (reportType) {
      case "minisplit":
        return {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                { text: "Equipo se encuentra operando", bold: true }, this.report.is_operating,
                { text: "Cuenta con filtro evaporador", bold: true }, this.report.filter
              ],
              [
                { text: "Control remoto funciona", bold: true }, this.report.remote_working,
                { text: "Voltaje de entrada", bold: true }, this.report.inner_voltage
              ],
              [
                { text: "Amperaje general", bold: true }, this.report.amperage,
                { text: "Ruido fuera de lo normal", bold: true }, this.report.unusual_noise

              ],
              [
                { text: "Observaciones", bold: true }, this.report.observations,
                { text: " ", border: [false, false, false, false] },
                { text: " ", border: [false, false, false, false] }
              ],
            ]
          },
          margin: [0, 10, 0, 10]
        };

      case "chiller":
        return {
          table: {
            widths: ['*', '*'],
            body: [
              [{ text: "PLC", bold: true }, this.report.plc_keys_working],
              [{ text: "Presión del Sistema", bold: true }, this.report.system_pressure_1],
              [{ text: "Nivel de aceite", bold: true }, this.report.oil_level],
            ]
          },
          margin: [0, 10, 0, 10]
        };

      case "uma":
        return {
          table: {
            widths: ['*', '*'],
            body: [
              [{ text: "Rejilla de aire", bold: true }, this.report.air_good_quality],
              [{ text: "Ajuste de banda", bold: true }, this.report.air_band_adjustment],
            ]
          },
          margin: [0, 10, 0, 10]
        };

      default:
        return { text: "Sin datos específicos de mantenimiento", margin: [0, 10, 0, 10] };
    }
  }



  async downloadTextPDF() {

    function buildImageRows(images: string[], columns: number) {
      const rows = [];
      for (let i = 0; i < images.length; i += columns) {
        const row = images.slice(i, i + columns).map(img => ({
          image: img,
          width: 150,
          margin: [2, 2, 2, 2]
        }));

        // Si la última fila tiene menos imágenes que columnas, llenamos con celdas vacías
        while (row.length < columns) {
          row.push({ text: '', border: [false, false, false, false] } as any);
        }

        rows.push(row);
      }
      return rows;
    }


    console.log("========== DEPURACIÓN PDF ==========");

    // Fotos
    console.log("📷 Procesando pictures:", this.report.pictures);
    const picturesBase64 = await Promise.all(
      (this.report.pictures || []).map((pic: string, i: number) =>
        this.toBase64(pic).catch(err => {
          console.error(`❌ Error en picture[${i}]:`, pic, err);
          return null;
        })
      )
    );

    // Firma
    if (this.report.signature) {
      console.log("✍️ Procesando signature:", this.report.signature);
    }
    const signatureBase64 = this.report.signature
      ? await this.toBase64(this.report.signature).catch(err => {
        console.error("❌ Error en signature:", this.report.signature, err);
        return null;
      })
      : null;

    console.log("📷 Pictures convertidos:", picturesBase64.filter(Boolean).length);
    console.log("✍️ Firma convertida:", !!signatureBase64);



    const docDefinition: any = {
      content: [
        { text: `Reporte ID: ${this.report.id}`, style: 'header' },
        { text: `Cliente: ${this.customer.name}`, style: 'subheader' },
        { text: `Email: ${this.customer.email}`, margin: [0, 0, 0, 10] },

        { text: `Mantenimiento ${this.report.report_type}`, style: 'subheader' },
        this.getTableForReportType(this.report.report_type),

        { text: 'Observaciones:', style: 'subheader' },
        { text: this.report.observations || 'Ninguna', margin: [0, 0, 0, 10] },
        {
          table: {
            widths: ['*', '*'],
            body: [
              [{ text: "lorem", bold: true }, "lorem ipsum"],
              [{ text: "lorem", bold: true }, "lorem ipsum 2"],
            ]
          }
        },


        { text: 'Fotos:', style: 'subheader' },

        {
          table: {
            widths: ['*', '*', '*'], // 3 columnas iguales
            body: buildImageRows(picturesBase64.filter(Boolean), 3) // función que creamos abajo
          },
          layout: 'noBorders',
          margin: [0, 5, 0, 5]
        },

        signatureBase64
          ? { text: 'Firma', style: 'subheader' }
          : null,
        signatureBase64
          ? { image: signatureBase64, width: 150 }
          : null

      ],
      styles: {
        header: { fontSize: 18, bold: true },
        subheader: { fontSize: 14, bold: true, margin: [0, 0, 0, 5] }
      }

    }
    pdfMake.createPdf(docDefinition).download((`reporte-${this.report.id}.pdf`));
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