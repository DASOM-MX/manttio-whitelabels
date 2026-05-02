import {
  Component,
  OnInit,
  ViewChild,
  ElementRef,
  EventEmitter,
  Output,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { SignatureComponent } from '../../components/signature-pad/signature-pad';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  FormControl
} from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
pdfMake.vfs = pdfFonts.vfs;

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ReportsService } from '../../../services/reports';
import { ImagePickerComponent } from '../../components/image-picker/image-picker';
import { environment } from '../../../environments/environment';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    SignatureComponent,
    ImagePickerComponent,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    CheckboxModule,
    DatePickerModule,
    ButtonModule,
    TagModule,
  ],
  templateUrl: './report-detail.html',
  styleUrl: './report-detail.scss',
})
export class ReportDetail implements OnInit {
  @Output() signatureChanged = new EventEmitter<string>();

  report: any = null;
  customer: any = null;
  reportUser: any = null;

  reportForm!: FormGroup;
  editMode = false;

  newPictures: File[] = [];
  removedPictures: string[] = [];

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private fb: FormBuilder,
    private reportsService: ReportsService,
    private router: Router
  ) {}

  @ViewChild('pdfContent', { static: false }) pdfContent!: ElementRef;

  downloadPDF() {
    const DATA = this.pdfContent.nativeElement;

    html2canvas(DATA, { scale: 2 }).then((canvas) => {
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
    try {
      const res = await fetch(url);

      if (!res.ok) {
        console.log(`❌ Error HTTP ${res.status}`);
      }

      const blob = await res.blob();
      return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          resolve(reader.result as string);
        };
        reader.onerror = (err) => {
          reject(err);
        };
        reader.readAsDataURL(blob);
      });
    } catch (err) {
      console.error('🔥 Error en toBase64 para', url, err);
      throw err;
    }
  }

  getTableForReportType(reportType: string) {
    switch (reportType) {
      case 'minisplit':
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
                  margin: [0, 5, 0, 5],
                },
                {},
                {},
                {},
              ],

              [
                { text: 'Equipo se encuentra operando', bold: true },
                this.report.is_operating || '',
                { text: 'Cuenta con filtro evaporador', bold: true },
                this.report.filter || '',
              ],
              [
                { text: 'Control remoto funciona', bold: true },
                this.report.remote_working || '',
                { text: 'Voltaje de entrada', bold: true },
                this.report.inner_voltage || '',
              ],
              [
                { text: 'Amperaje general', bold: true },
                this.report.amperage || '',
                { text: 'Ruido fuera de lo normal', bold: true },
                this.report.unusual_noise || '',
              ],
              [
                { text: 'Observaciones', bold: true },
                this.report.observations || 'Ninguna',
                { text: ' ', border: [false, false, false, false] },
                { text: ' ', border: [false, false, false, false] },
              ],
            ],
          },
          margin: [0, 10, 0, 10],
        };

      case 'chiller':
        console.log('chillertest');
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
                  margin: [0, 5, 0, 5],
                },
                { text: '' },
                { text: '' },
                { text: '' },
              ],
              [
                { text: 'Equipo se encuentra operando', bold: true },
                { text: this.report.is_operating || '' },
                { text: 'Switch de flujo funciona', bold: true },
                { text: this.report.flux_switch_working || '' },
              ],
              [
                { text: 'Temperatura de entrada', bold: true },
                { text: this.report.inner_temperature || '' },
                { text: 'Temperatura de salida', bold: true },
                { text: this.report.outer_temperature || '' },
              ],
              [
                { text: 'Teclas del PLC funcionan', bold: true },
                { text: this.report.plc_keys_working || '' },
                { text: 'Voltaje de entrada', bold: true },
                { text: this.report.inner_voltage || '' },
              ],
              [
                { text: 'Amperaje de motor condensador general', bold: true },
                { text: this.report.motor_amperage || '' },
                { text: 'Presiones del sistema 1', bold: true },
                { text: this.report.system_pressure_1 || '' },
              ],
              [
                { text: 'Presiones del sistema 2', bold: true },
                { text: this.report.system_pressure_2 || '' },
                { text: 'Presiones del sistema 3', bold: true },
                { text: this.report.system_pressure_3 || '' },
              ],

              [
                { text: 'Presiones del sistema 2', bold: true },
                { text: this.report.system_pressure_2 || '' },
                { text: 'Presiones del sistema 3', bold: true },
                { text: this.report.system_pressure_3 || '' },
              ],
              [
                { text: 'Presión de aceite', bold: true },
                { text: this.report.oil_pressure || '' },
                { text: 'Nivel de aceite', bold: true },
                { text: this.report.oil_level || '' },
              ],
            ],
          },
          margin: [0, 10, 0, 10],
        };

      case 'uma':
        console.log('uma test');
        return {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [
                {
                  text: 'Formulario UMAS',
                  colSpan: 4,
                  alignment: 'center',
                  fillColor: '#DCDCDC',
                  bold: true,
                  margin: [0, 5, 0, 5],
                },
                { text: '' },
                { text: '' },
                { text: '' },
              ],
              [
                { text: 'Equipo se encuentra operando', bold: true },
                { text: this.report.is_operating || '' },
                { text: 'Se ajustó la banda de la UMA', bold: true },
                { text: this.report.air_band_adjustment || '' },
              ],
              [
                { text: 'Temperatura de entrada', bold: true },
                { text: this.report.inner_temperature || '' },
                { text: 'Temperatura de salida', bold: true },
                { text: this.report.outer_temperature || '' },
              ],
              [
                { text: 'Rejilla de aire en buenas condiciones', bold: true },
                { text: this.report.air_good_quality || '' },
                { text: 'Voltaje de entrada', bold: true },
                { text: this.report.inner_voltage || '' },
              ],
              [
                { text: 'Amperaje del motor', bold: true },
                { text: this.report.motor_amperage || '' },
                { text: 'Ruido fuera de lo normal', bold: true },
                { text: this.report.unusual_noise || '' },
              ],
              [
                { text: 'Observaciones', bold: true },
                { text: this.report.observations || 'Ninguna' },
                { text: '', border: [false, false, false, false] },
                { text: '', border: [false, false, false, false] },
              ],
            ],
          },
          margin: [0, 10, 0, 10],
        };

      default:
        return {
          text: 'Sin datos específicos de mantenimiento',
          margin: [0, 10, 0, 10],
        };
    }
  }

  async downloadTextPDF() {
    function buildImageRows(images: string[], columns: number) {
      const rows = [];
      for (let i = 0; i < images.length; i += columns) {
        const row = images.slice(i, i + columns).map((img) => ({
          image: img,
          width: 150,
          margin: [2, 2, 2, 2],
        }));

        // Si la última fila tiene menos imágenes que columnas, llenamos con celdas vacías
        while (row.length < columns) {
          row.push({ text: '', border: [false, false, false, false] } as any);
        }

        rows.push(row);
      }
      return rows;
    }

    // Fotos
    console.log(' Procesando pictures:', this.report.pictures);
    const picturesBase64 = await Promise.all(
      (this.report.pictures || []).map((pic: string, i: number) =>
        this.toBase64(pic).catch((err) => {
          console.error(`❌ Error en picture[${i}]:`, pic, err);
          return null;
        })
      )
    );

    // Firma
    if (this.report.signature) {
      console.log(' Procesando signature:', this.report.signature);
    }
    const signatureBase64 = this.report.signature
      ? await this.toBase64(this.report.signature).catch((err) => {
          return null;
        })
      : null;

    const formatDate = (dateString: string) => {
      const date = new Date(dateString);
      return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    };

    const docDefinition: any = {
      content: [
        {
          table: {
            widths: ['*', '*'],
            body: [
              [
                {
                  text: `${this.customer.name}`,
                  style: 'header',
                  border: [false, false, false, true],
                },
                {
                  text: `${this.report.id}`,
                  style: 'subheader',
                  alignment: 'right',
                  border: [false, false, false, true],
                },
              ],
            ],
          },
        },

        {
          table: {
            widths: ['*', '*'], // dos columnas
            body: [
              [
                {
                  text: 'Datos del Cliente',
                  colSpan: 2,
                  alignment: 'center',
                  fillColor: '#DCDCDC',
                  bold: true,
                  color: 'dark',
                  margin: [0, 5, 0, 5],
                },
                {}, // celda vacía porque usamos colSpan
              ],

              [
                {
                  text: 'Identificación',
                  bold: true,
                  border: [true, true, true, true],
                },
                {
                  text: this.customer.identification || '',
                  border: [true, true, true, true],
                },
              ],
              [
                {
                  text: 'Teléfono',
                  bold: true,
                  border: [true, true, true, true],
                },
                {
                  text: this.customer.phone || '',
                  border: [true, true, true, true],
                },
              ],
              [
                { text: 'Email', bold: true, border: [true, true, true, true] },
                {
                  text: this.customer.email || '',
                  border: [true, true, true, true],
                },
              ],
              [
                {
                  text: 'Observación',
                  bold: true,
                  border: [true, true, true, true],
                },
                {
                  text: this.customer.observation || '',
                  border: [true, true, true, true],
                },
              ],
            ],
          },
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
                  margin: [0, 5, 0, 5],
                },
                {},
                {},
                {},
              ],

              [
                { text: 'Para:', bold: true },
                this.reportUser.name,
                { text: 'Tipo de tarea:', bold: true },
                this.report.manttio_type,
              ],
              [
                { text: 'Fecha Llegada:', bold: true },
                formatDate(this.report.date_arrival),
                { text: 'Fecha Salida', bold: true },
                formatDate(this.report.date_departure),
              ],

              [
                { text: 'Observaciones', bold: true },
                this.report.observations,
                { text: ' ', border: [false, false, false, false] },
                { text: ' ', border: [false, false, false, false] },
              ],
            ],
          },
          margin: [0, 10, 0, 10],
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
                  margin: [0, 5, 0, 5],
                },
                {},
                {},
              ],

              // 🔹 Aquí van las imágenes en filas de 3
              ...(() => {
                const rows: any[] = [];
                const imgs = picturesBase64.filter(Boolean);

                for (let i = 0; i < imgs.length; i += 3) {
                  rows.push([
                    { image: imgs[i], width: 150, margin: [0, 5, 0, 5] },
                    imgs[i + 1]
                      ? { image: imgs[i + 1], width: 150, margin: [0, 5, 0, 5] }
                      : {},
                    imgs[i + 2]
                      ? { image: imgs[i + 2], width: 150, margin: [0, 5, 0, 5] }
                      : {},
                  ]);
                }
                return rows;
              })(),
            ],
          },
          layout: '',
          margin: [0, 10, 0, 10],
        },

        signatureBase64
          ? { image: signatureBase64, width: 150, alignment: 'center' }
          : null,
        signatureBase64
          ? {
              text: `Firmado por: ${this.report.signed_by}`,
              style: 'subheader',
              alignment: 'center',
            }
          : null,
      ],
      styles: {
        header: { fontSize: 18, bold: true },
        subheader: { fontSize: 14, bold: true, margin: [0, 0, 0, 5] },
      },
    };
    pdfMake.createPdf(docDefinition).download(`reporte-${this.report.id}.pdf`);
  }

  private buildReportForm() {
    if (!this.report) return;

    // Campos comunes a todos los reportes
    const commonControls: any = {
      observations: [this.report.observations || ''],
      unusual_noise: [this.report.unusual_noise || false],
      date_arrival: [this.report.date_arrival || ''],
      date_departure: [this.report.date_departure || ''],
    };

    let specificControls: any = {};

    switch (this.report.report_type) {
      case 'minisplit':
        specificControls = {
          is_operating: [this.report.is_operating || false],
          remote_working: [this.report.remote_working || false],
          amperage: [this.report.amperage || ''],
          inner_voltage: [this.report.inner_voltage || ''],
          filter: [this.report.filter || false],
        };
        break;

      case 'chiller':
        specificControls = {
          is_operating: [this.report.is_operating || false],
          inner_temperature: [this.report.inner_temperature || ''],
          outer_temperature: [this.report.outer_temperature || ''],
          inner_voltage: [this.report.inner_voltage || ''],
          plc_keys_working: [this.report.plc_keys_working || false],
          motor_amperage: [this.report.motor_amperage || ''],
          system_pressure_1: [this.report.system_pressure_1 || ''],
          system_pressure_2: [this.report.system_pressure_2 || ''],
          system_pressure_3: [this.report.system_pressure_3 || ''],
          oil_pressure: [this.report.oil_pressure || ''],
          oil_level: [this.report.oil_level || ''],
          flux_switch_working: [this.report.flux_switch_working || false],
        };
        break;

      case 'uma':
        specificControls = {
          is_operating: [this.report.is_operating || false],
          air_band_adjustment: [this.report.air_band_adjustment || false],
          inner_temperature: [this.report.inner_temperature || ''],
          outer_temperature: [this.report.outer_temperature || ''],
          air_good_quality: [this.report.air_good_quality || false],
          inner_voltage: [this.report.inner_voltage || ''],
          motor_amperage: [this.report.motor_amperage || ''],
        };
        break;
    }

    // Combinar controles comunes y específicos
    this.reportForm = this.fb.group({
      ...commonControls,
      ...specificControls,
    });
  }

  ngOnInit(): void {
    this.reportForm = new FormGroup({
      observations: new FormControl(''),
      unusual_noise: new FormControl(this.report?.unusual_noise || false),
    });

    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.http
        .get(`${environment.apiUrl}reports/${id}`, {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        })
        .subscribe((data) => {
          this.report = data;
          this.cdr.detectChanges();
          console.log(data);

          //for editing report: minisplit
          this.buildReportForm();

          this.http
            .get<any[]>(
              `${environment.apiUrl}customers/${this.report.client_id}`,
              {
                headers: {
                  Authorization: `Bearer ${localStorage.getItem('token')}`,
                },
              }
            )
            .subscribe((clients) => {
              console.log('Cliente unico recibido:', clients);

              this.customer = clients;
              this.cdr.detectChanges();
            });

          this.http
            .get<any>(`${environment.apiUrl}user/${this.report.user_id}`, {
              headers: {
                Authorization: `Bearer ${localStorage.getItem('token')}`,
              },
            })
            .subscribe((user) => {
              this.reportUser = user;

              this.cdr.detectChanges();
              console.log('Usuario del reporte:', user);
            });
        });
    }
  }

  toggleEdit() {
    this.editMode = !this.editMode;
    if (this.editMode) {
      this.reportForm.patchValue(this.report);
    }
  }

  async saveChanges() {
    if (this.reportForm.invalid) return;

    try {
      //  Guardar los cambios normales del formulario
      await this.reportsService
        .updateReport(this.report.id, this.reportForm.value)
        .toPromise();

      //  Subir las nuevas imágenes (si hay)
      if (
        (this.newPictures && this.newPictures.length > 0) ||
        (this.removedPictures && this.removedPictures.length > 0)
      ) {
        await this.savePictures(this.newPictures);
        // this.newPictures = [];
      }

      //terminar edicion
      this.editMode = false;
      Swal.fire('Éxito', 'Reporte actualizado correctamente', 'success');
      this.editMode = false;
      this.cdr.detectChanges();

      //  Refrescar el reporte desde el backend
      // this.report = await this.reportsService.getReport(this.report.id).toPromise();

      // this.editMode = false;
    } catch (error) {
      Swal.fire('Error', 'No se pudieron guardar los cambios', 'error');
    }
  }

  async onSignatureSaved(signatureData: string) {
    if (signatureData) {
      const result = await Swal.fire({
        title: '¿Deseas firmar este reporte?',
        text: 'Una vez firmado, no podrá ser modificado',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, firmar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
      });

      if (result.isConfirmed) {
        const token = localStorage.getItem('token');

        const file = this.dataURLtoFile(
          signatureData,
          `signature-${Date.now()}.jpg`
        );

        const fd = new FormData();
        fd.append('signature', file);
        fd.append('signed_by', localStorage.getItem('username') || 'Técnico');
        fd.append('report_status', 'true');

        this.http
          .put(
            `${environment.apiUrl}reports/${this.report.id}/signature`,
            fd,
            {
              headers: {
                Authorization: `Bearer ${token}`,
              },
            }
          )
          .subscribe({
            next: (updated: any) => {
              this.report = updated;
              this.editMode = false;

              Swal.fire({
                title: 'Reporte firmado exitosamente',
                icon: 'success',
              });
              this.reloadComponent();
            },
            error: (err) => {
              console.error('Error guardando firma:', err);

              Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'Ha ocurrido un error al firmar el reporte',
              });
            },
          });
      }
    }
  }

  onNewPicturesSelected(files: File[]) {
    this.newPictures = files; // imágenes nuevas
  }

  onExistingPicturesRemoved(removed: string[]) {
    this.removedPictures.push(...removed); // guardamos URLs a borrar
    console.log('imagenes a remover', this.removedPictures);
  }

  async savePictures(files: File[]) {
    const token = localStorage.getItem('token');

    try {
      let updatedReport = this.report;

      // Subir nuevas imágenes si existen
      if (files.length > 0) {
        const fd = new FormData();
        files.forEach((file) => fd.append('pictures', file));

        updatedReport = await this.http
          .put<any>(
            `${environment.apiUrl}reports/${this.report.id}/pictures`,
            fd,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          .toPromise();
      }

      // Borrar imágenes si hay URLs a eliminar
      if (this.removedPictures.length > 0) {
        await this.http
          .request(
            'delete',
            `${environment.apiUrl}reports/${this.report.id}/pictures`,
            {
              body: { images: this.removedPictures },
              headers: { Authorization: `Bearer ${token}` },
            }
          )
          .toPromise();
      }

      // Refrescar reporte desde backend
      const freshReport = await this.reportsService
        .getReport(this.report.id)
        .toPromise();

      // Actualizar estado del componente
      this.report = freshReport;
      this.newPictures = [];
      this.removedPictures = [];
      this.cdr.detectChanges();
    } catch (err) {
      console.error('Error al guardar imágenes:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron guardar los cambios en las imágenes',
      });
    }
  }

  reloadComponent(): void {
    this.router.navigateByUrl('/', { skipLocationChange: true }).then(() => {
      this.router.navigate([this.router.url]);
    });
  }

  private dataURLtoFile(dataURL: string, filename: string): File {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
  }
}
