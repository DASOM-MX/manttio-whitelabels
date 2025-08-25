import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { Reports } from '../reports/reports';
import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";
pdfMake.vfs = pdfFonts.vfs;



import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';



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
  reportUser: any = null;
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
                {
                  text: 'Formulario: Mantenimiento Minisplit',
                  colSpan: 4,
                  alignment: 'center',
                  fillColor: '#DCDCDC',
                  bold: true,
                  color: 'dark',
                  margin: [0, 5, 0, 5]
                },
                {}, {}, {}
              ],

              [
                { text: "Equipo se encuentra operando", bold: true }, this.report.is_operating || "",
                { text: "Cuenta con filtro evaporador", bold: true }, this.report.filter || ""
              ],
              [
                { text: "Control remoto funciona", bold: true }, this.report.remote_working || "",
                { text: "Voltaje de entrada", bold: true }, this.report.inner_voltage || ""
              ],
              [
                { text: "Amperaje general", bold: true }, this.report.amperage || "",
                { text: "Ruido fuera de lo normal", bold: true }, this.report.unusual_noise || ""

              ],
              [
                { text: "Observaciones", bold: true }, this.report.observations || "Ninguna",
                { text: " ", border: [false, false, false, false] },
                { text: " ", border: [false, false, false, false] }
              ],
            ]
          },
          margin: [0, 10, 0, 10]
        };

      case "chiller":
        console.log("chillertest")
        return {
          table: {
            widths: ['35%', '15%', '35%', '15%'],
            body: [
              [
                {
                  text: 'Informaciones de las actividades',
                  colSpan: 4,
                  alignment: 'center',
                  fillColor: '#DCDCDC',
                  bold: true,
                  color: 'dark',
                  margin: [0, 5, 0, 5]
                },
                { text: '' },
                { text: '' },
                { text: '' }
              ],
              [
                { text: "Equipo se encuentra operando", bold: true },
                { text: this.report.is_operating || '' },
                { text: "Switch de flujo funciona", bold: true },
                { text: this.report.flux_switch_working || '' },
              ],
              [
                { text: "Temperatura de entrada", bold: true },
                { text: this.report.inner_temperature || '' },
                { text: "Temperatura de salida", bold: true },
                { text: this.report.outer_temperature || '' }

              ],
              [
                { text: "Teclas del PLC funcionan", bold: true },
                { text: this.report.plc_keys_working || '' },
                { text: "Voltaje de entrada", bold: true },
                { text: this.report.inner_voltage || '' }

              ],
              [
                { text: "Amperaje de motor condensador general", bold: true },
                { text: this.report.motor_amperage || '' },
                { text: "Presiones del sistema 1", bold: true },
                { text: this.report.system_pressure_1 || '' }

              ],
              [
                { text: "Presiones del sistema 2", bold: true },
                { text: this.report.system_pressure_2 || '' },
                { text: "Presiones del sistema 3", bold: true },
                { text: this.report.system_pressure_3 || '' }

              ],

              [
                { text: "Presiones del sistema 2", bold: true },
                { text: this.report.system_pressure_2 || '' },
                { text: "Presiones del sistema 3", bold: true },
                { text: this.report.system_pressure_3 || '' }

              ],
              [
                { text: "Presión de aceite", bold: true },
                { text: this.report.oil_pressure || '' },
                { text: "Nivel de aceite", bold: true },
                { text: this.report.oil_level || '' }

              ],
            ]
          },
          margin: [0, 10, 0, 10]
        };

      case "uma":
        console.log("uma test");
        return {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                { text: 'Formulario UMAS', colSpan: 4, alignment: 'center', fillColor: '#DCDCDC', bold: true, margin: [0, 5, 0, 5] },
                { text: '' },
                { text: '' },
                { text: '' }
              ],
              [
                { text: "Equipo se encuentra operando", bold: true },
                { text: this.report.is_operating || '' },
                { text: "Se ajustó la banda de la UMA", bold: true },
                { text: this.report.air_band_adjustment || '' }
              ],
              [
                { text: "Temperatura de entrada", bold: true },
                { text: this.report.inner_temperature || '' },
                { text: "Temperatura de salida", bold: true },
                { text: this.report.outer_temperature || '' }
              ],
              [
                { text: "Rejilla de aire en buenas condiciones", bold: true },
                { text: this.report.air_good_quality || '' },
                { text: "Voltaje de entrada", bold: true },
                { text: this.report.inner_voltage || '' }
              ],
              [
                { text: "Amperaje del motor", bold: true },
                { text: this.report.motor_amperage || '' },
                { text: "Ruido fuera de lo normal", bold: true },
                { text: this.report.unusual_noise || '' }

              ],
              [
                { text: "Observaciones", bold: true },
                { text: this.report.observations || 'Ninguna' },
                { text: '', border: [false, false, false, false] },
                { text: '', border: [false, false, false, false] }
              ]
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
    console.log(" Procesando pictures:", this.report.pictures);
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
      console.log(" Procesando signature:", this.report.signature);
    }
    const signatureBase64 = this.report.signature
      ? await this.toBase64(this.report.signature).catch(err => {
        console.error("❌ Error en signature:", this.report.signature, err);
        return null;
      })
      : null;

    console.log(" Pictures convertidos:", picturesBase64.filter(Boolean).length);
    console.log(" Firma convertida:", !!signatureBase64);


    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'

      })
    }


    const docDefinition: any = {
      content: [
        {
          table: {
            widths: ['*', '*'],
            body: [
              [
                { text: `${this.customer.name}`, style: 'header', border: [false, false, false, true] },
                { text: `${this.report.id}`, style: 'subheader', alignment: "right", border: [false, false, false, true] }
              ],
            ]
          }
        },

        {

          table: {
            widths: ['*', '*',], // dos columnas
            body: [
              [
                {
                  text: 'Datos del Cliente',
                  colSpan: 2,
                  alignment: 'center',
                  fillColor: '#DCDCDC',
                  bold: true,
                  color: 'dark',
                  margin: [0, 5, 0, 5]
                },
                {} // celda vacía porque usamos colSpan
              ],

              [
                { text: 'Identificación', bold: true, border: [true, true, true, true] },
                { text: this.customer.identification || '', border: [true, true, true, true] }
              ],
              [
                { text: 'Teléfono', bold: true, border: [true, true, true, true] },
                { text: this.customer.phone || '', border: [true, true, true, true] }
              ],
              [
                { text: 'Email', bold: true, border: [true, true, true, true] },
                { text: this.customer.email || '', border: [true, true, true, true] }
              ],
              [
                { text: 'Observación', bold: true, border: [true, true, true, true] },
                { text: this.customer.observation || '', border: [true, true, true, true] }
              ]
            ]
          }
        },
        {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [

              [
                {
                  text: 'Informaciones de las actividades',
                  colSpan: 4,
                  alignment: 'center',
                  fillColor: '#DCDCDC',
                  bold: true,
                  color: 'dark',
                  margin: [0, 5, 0, 5]
                },
                {}, {}, {}
              ],

              [
                { text: "Para:", bold: true }, this.reportUser.name,
                { text: "Tipo de tarea:", bold: true }, this.report.manttio_type,
              ],
              [
                { text: "Fecha Llegada:", bold: true }, formatDate(this.report.date_arrival),
                { text: "Fecha Salida", bold: true }, formatDate(this.report.date_departure),
              ],

              [
                { text: "Observaciones", bold: true }, this.report.observations,
                { text: " ", border: [false, false, false, false] },
                { text: " ", border: [false, false, false, false] }
              ],
            ]
          },
          margin: [0, 10, 0, 10]
        },

        this.getTableForReportType(this.report.report_type),


        {
          table: {
            widths: ['*', '*', '*'],
            body: [
              // 🔹 Fila de título que ocupa las 3 columnas
              [
                {
                  text: 'Fotos del Reporte',
                  colSpan: 3,
                  alignment: 'center',
                  bold: true,
                  color: 'dark',
                  fillColor: '#DCDCDC', // oro
                  margin: [0, 5, 0, 5]
                },
                {},
                {}
              ],

              // 🔹 Aquí van las imágenes en filas de 3
              ...(() => {
                const rows: any[] = [];
                const imgs = picturesBase64.filter(Boolean);

                for (let i = 0; i < imgs.length; i += 3) {
                  rows.push([
                    { image: imgs[i], width: 150, margin: [0, 5, 0, 5] },
                    imgs[i + 1] ? { image: imgs[i + 1], width: 150, margin: [0, 5, 0, 5] } : {},
                    imgs[i + 2] ? { image: imgs[i + 2], width: 150, margin: [0, 5, 0, 5] } : {},
                  ]);
                }
                return rows;
              })()
            ]
          },
          layout: '',
          margin: [0, 10, 0, 10]
        },

        signatureBase64
          ? { text: 'Firma', style: 'subheader', alignment: 'center' }
          : null,
        signatureBase64
          ? { image: signatureBase64, width: 150, alignment: 'center' }
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

        this.http.get<any>(`http://localhost:3000/user/${this.report.user_id}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        }).subscribe(user => {
          this.reportUser = user;
          this.cdr.detectChanges();
          console.log("Usuario del reporte:", user);
        })

      })
    }

  }
}