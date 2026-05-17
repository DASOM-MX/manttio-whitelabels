import {
  Component,
  ElementRef,
  EventEmitter,
  OnInit,
  Output,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Store } from '@ngxs/store';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import Swal from 'sweetalert2';
import { SignatureComponent } from '../../components/signature-pad/signature-pad';
import { ImagePickerComponent } from '../../components/image-picker/image-picker';
import { ReportsService } from '../../../services/reports';
import { environment } from '../../../environments/environment';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DatePipe, SlicePipe } from '@angular/common';
import { AuthState } from '../../store/auth/auth';
import { LoadReports } from '../../store/reports/actions/load-reports';

pdfMake.vfs = pdfFonts.vfs;

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [
    DatePipe,
    SlicePipe,
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
  @ViewChild('pdfContent', { static: false }) pdfContent!: ElementRef;

  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private reportsService = inject(ReportsService);
  private router = inject(Router);
  private store = inject(Store);

  report = signal<any | null>(null);
  customer = signal<any | null>(null);
  reportUser = signal<any | null>(null);
  editMode = signal(false);
  newPictures = signal<File[]>([]);
  removedPictures = signal<string[]>([]);

  reportForm: FormGroup = new FormGroup({
    observations: new FormControl(''),
    unusual_noise: new FormControl(false),
  });

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    const token = this.store.selectSnapshot(AuthState.token);
    const headers = { Authorization: `Bearer ${token}` };

    this.http.get(`${environment.apiUrl}reports/${id}`, { headers }).subscribe((data: any) => {
      this.report.set(data);
      this.buildReportForm();

      this.http
        .get<any>(`${environment.apiUrl}customers/${data.client_id}`, { headers })
        .subscribe((customer) => this.customer.set(customer));

      this.http
        .get<any>(`${environment.apiUrl}user/${data.user_id}`, { headers })
        .subscribe((user) => this.reportUser.set(user));
    });
  }

  toggleEdit() {
    this.editMode.update((v) => !v);
    if (this.editMode()) {
      this.reportForm.patchValue(this.report() ?? {});
    }
  }

  async saveChanges() {
    if (this.reportForm.invalid) return;
    const r = this.report();
    if (!r) return;

    try {
      await this.reportsService.updateReport(r.id, this.reportForm.value).toPromise();

      if (this.newPictures().length > 0 || this.removedPictures().length > 0) {
        await this.savePictures(this.newPictures());
      }

      this.editMode.set(false);
      this.store.dispatch(new LoadReports(true));
      Swal.fire('Éxito', 'Reporte actualizado correctamente', 'success');
    } catch {
      Swal.fire('Error', 'No se pudieron guardar los cambios', 'error');
    }
  }

  onNewPicturesSelected(files: File[]) {
    this.newPictures.set(files);
  }

  onExistingPicturesRemoved(removed: string[]) {
    this.removedPictures.update((current) => [...current, ...removed]);
  }

  async onSignatureSaved(signatureData: string) {
    if (!signatureData) return;
    const r = this.report();
    if (!r) return;

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
    if (!result.isConfirmed) return;

    const token = this.store.selectSnapshot(AuthState.token);
    const userEmail = this.store.selectSnapshot(AuthState.user)?.email ?? 'Técnico';
    const file = this.dataURLtoFile(signatureData, `signature-${Date.now()}.jpg`);

    const fd = new FormData();
    fd.append('signature', file);
    fd.append('signed_by', userEmail);
    fd.append('report_status', 'true');

    this.http
      .put(`${environment.apiUrl}reports/${r.id}/signature`, fd, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .subscribe({
        next: (updated: any) => {
          this.report.set(updated);
          this.editMode.set(false);
          this.store.dispatch(new LoadReports(true));
          Swal.fire({ title: 'Reporte firmado exitosamente', icon: 'success' });
          this.reloadComponent();
        },
        error: (err) => {
          console.error('Error guardando firma:', err);
          Swal.fire({ icon: 'error', title: 'Error', text: 'Ha ocurrido un error al firmar el reporte' });
        },
      });
  }

  async savePictures(files: File[]) {
    const r = this.report();
    if (!r) return;
    const token = this.store.selectSnapshot(AuthState.token);
    const headers = { Authorization: `Bearer ${token}` };

    try {
      if (files.length > 0) {
        const fd = new FormData();
        files.forEach((file) => fd.append('pictures', file));
        await this.http
          .put<any>(`${environment.apiUrl}reports/${r.id}/pictures`, fd, { headers })
          .toPromise();
      }

      const removed = this.removedPictures();
      if (removed.length > 0) {
        await this.http
          .request('delete', `${environment.apiUrl}reports/${r.id}/pictures`, {
            body: { images: removed },
            headers,
          })
          .toPromise();
      }

      const fresh = await this.reportsService.getReport(r.id).toPromise();
      this.report.set(fresh);
      this.newPictures.set([]);
      this.removedPictures.set([]);
    } catch (err) {
      console.error('Error al guardar imágenes:', err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'No se pudieron guardar los cambios en las imágenes',
      });
    }
  }

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
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(blob);
    });
  }

  async downloadTextPDF() {
    const r = this.report();
    const c = this.customer();
    const u = this.reportUser();
    if (!r || !c) return;

    const picturesBase64 = await Promise.all(
      (r.pictures || []).map((pic: string) => this.toBase64(pic).catch(() => null)),
    );
    const signatureBase64 = r.signature
      ? await this.toBase64(r.signature).catch(() => null)
      : null;

    const formatDate = (dateString: string) =>
      new Date(dateString).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

    const docDefinition: any = {
      content: [
        {
          table: {
            widths: ['*', '*'],
            body: [[
              { text: `${c.name}`, style: 'header', border: [false, false, false, true] },
              { text: `${r.id}`, style: 'subheader', alignment: 'right', border: [false, false, false, true] },
            ]],
          },
        },
        {
          table: {
            widths: ['*', '*'],
            body: [
              [{ text: 'Datos del Cliente', colSpan: 2, alignment: 'center', fillColor: '#DCDCDC', bold: true, color: 'dark', margin: [0, 5, 0, 5] }, {}],
              [{ text: 'Identificación', bold: true }, c.identification || ''],
              [{ text: 'Teléfono', bold: true }, c.phone || ''],
              [{ text: 'Email', bold: true }, c.email || ''],
              [{ text: 'Observación', bold: true }, c.observation || ''],
            ],
          },
        },
        {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [{ text: 'Informaciones de las actividades', colSpan: 4, alignment: 'center', fillColor: '#DCDCDC', bold: true, color: 'dark', margin: [0, 5, 0, 5] }, {}, {}, {}],
              [{ text: 'Para:', bold: true }, u?.name ?? '', { text: 'Tipo de tarea:', bold: true }, r.manttio_type],
              [{ text: 'Fecha Llegada:', bold: true }, formatDate(r.date_arrival), { text: 'Fecha Salida', bold: true }, formatDate(r.date_departure)],
              [{ text: 'Observaciones', bold: true }, r.observations, { text: ' ', border: [false, false, false, false] }, { text: ' ', border: [false, false, false, false] }],
            ],
          },
          margin: [0, 10, 0, 10],
        },
        this.getTableForReportType(r.report_type, r),
        {
          table: {
            widths: ['*', '*', '*'],
            body: [
              [{ text: 'Fotos del Reporte', colSpan: 3, alignment: 'center', bold: true, color: 'dark', fillColor: '#DCDCDC', margin: [0, 5, 0, 5] }, {}, {}],
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
              })(),
            ],
          },
          margin: [0, 10, 0, 10],
        },
        signatureBase64 ? { image: signatureBase64, width: 150, alignment: 'center' } : null,
        signatureBase64 ? { text: `Firmado por: ${r.signed_by}`, style: 'subheader', alignment: 'center' } : null,
      ],
      styles: {
        header: { fontSize: 18, bold: true },
        subheader: { fontSize: 14, bold: true, margin: [0, 0, 0, 5] },
      },
    };
    pdfMake.createPdf(docDefinition).download(`reporte-${r.id}.pdf`);
  }

  private getTableForReportType(reportType: string, r: any) {
    switch (reportType) {
      case 'minisplit':
        return {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [{ text: 'Formulario: Mantenimiento Minisplit', colSpan: 4, alignment: 'center', fillColor: '#DCDCDC', bold: true, color: 'dark', margin: [0, 5, 0, 5] }, {}, {}, {}],
              [{ text: 'Equipo se encuentra operando', bold: true }, r.is_operating || '', { text: 'Cuenta con filtro evaporador', bold: true }, r.filter || ''],
              [{ text: 'Control remoto funciona', bold: true }, r.remote_working || '', { text: 'Voltaje de entrada', bold: true }, r.inner_voltage || ''],
              [{ text: 'Amperaje general', bold: true }, r.amperage || '', { text: 'Ruido fuera de lo normal', bold: true }, r.unusual_noise || ''],
              [{ text: 'Observaciones', bold: true }, r.observations || 'Ninguna', { text: ' ', border: [false, false, false, false] }, { text: ' ', border: [false, false, false, false] }],
            ],
          },
          margin: [0, 10, 0, 10],
        };
      case 'chiller':
        return {
          table: {
            widths: ['35%', '15%', '35%', '15%'],
            body: [
              [{ text: 'Informaciones de las actividades', colSpan: 4, alignment: 'center', fillColor: '#DCDCDC', bold: true, color: 'dark', margin: [0, 5, 0, 5] }, {}, {}, {}],
              [{ text: 'Equipo se encuentra operando', bold: true }, r.is_operating || '', { text: 'Switch de flujo funciona', bold: true }, r.flux_switch_working || ''],
              [{ text: 'Temperatura de entrada', bold: true }, r.inner_temperature || '', { text: 'Temperatura de salida', bold: true }, r.outer_temperature || ''],
              [{ text: 'Teclas del PLC funcionan', bold: true }, r.plc_keys_working || '', { text: 'Voltaje de entrada', bold: true }, r.inner_voltage || ''],
              [{ text: 'Amperaje de motor condensador general', bold: true }, r.motor_amperage || '', { text: 'Presiones del sistema 1', bold: true }, r.system_pressure_1 || ''],
              [{ text: 'Presiones del sistema 2', bold: true }, r.system_pressure_2 || '', { text: 'Presiones del sistema 3', bold: true }, r.system_pressure_3 || ''],
              [{ text: 'Presión de aceite', bold: true }, r.oil_pressure || '', { text: 'Nivel de aceite', bold: true }, r.oil_level || ''],
            ],
          },
          margin: [0, 10, 0, 10],
        };
      case 'uma':
        return {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [{ text: 'Formulario UMAS', colSpan: 4, alignment: 'center', fillColor: '#DCDCDC', bold: true, margin: [0, 5, 0, 5] }, {}, {}, {}],
              [{ text: 'Equipo se encuentra operando', bold: true }, r.is_operating || '', { text: 'Se ajustó la banda de la UMA', bold: true }, r.air_band_adjustment || ''],
              [{ text: 'Temperatura de entrada', bold: true }, r.inner_temperature || '', { text: 'Temperatura de salida', bold: true }, r.outer_temperature || ''],
              [{ text: 'Rejilla de aire en buenas condiciones', bold: true }, r.air_good_quality || '', { text: 'Voltaje de entrada', bold: true }, r.inner_voltage || ''],
              [{ text: 'Amperaje del motor', bold: true }, r.motor_amperage || '', { text: 'Ruido fuera de lo normal', bold: true }, r.unusual_noise || ''],
              [{ text: 'Observaciones', bold: true }, r.observations || 'Ninguna', { text: '', border: [false, false, false, false] }, { text: '', border: [false, false, false, false] }],
            ],
          },
          margin: [0, 10, 0, 10],
        };
      default:
        return { text: 'Sin datos específicos de mantenimiento', margin: [0, 10, 0, 10] };
    }
  }

  private buildReportForm() {
    const r = this.report();
    if (!r) return;

    const commonControls: any = {
      observations: [r.observations || ''],
      unusual_noise: [r.unusual_noise || false],
      date_arrival: [r.date_arrival || ''],
      date_departure: [r.date_departure || ''],
    };

    let specificControls: any = {};
    switch (r.report_type) {
      case 'minisplit':
        specificControls = {
          is_operating: [r.is_operating || false],
          remote_working: [r.remote_working || false],
          amperage: [r.amperage || ''],
          inner_voltage: [r.inner_voltage || ''],
          filter: [r.filter || false],
        };
        break;
      case 'chiller':
        specificControls = {
          is_operating: [r.is_operating || false],
          inner_temperature: [r.inner_temperature || ''],
          outer_temperature: [r.outer_temperature || ''],
          inner_voltage: [r.inner_voltage || ''],
          plc_keys_working: [r.plc_keys_working || false],
          motor_amperage: [r.motor_amperage || ''],
          system_pressure_1: [r.system_pressure_1 || ''],
          system_pressure_2: [r.system_pressure_2 || ''],
          system_pressure_3: [r.system_pressure_3 || ''],
          oil_pressure: [r.oil_pressure || ''],
          oil_level: [r.oil_level || ''],
          flux_switch_working: [r.flux_switch_working || false],
        };
        break;
      case 'uma':
        specificControls = {
          is_operating: [r.is_operating || false],
          air_band_adjustment: [r.air_band_adjustment || false],
          inner_temperature: [r.inner_temperature || ''],
          outer_temperature: [r.outer_temperature || ''],
          air_good_quality: [r.air_good_quality || false],
          inner_voltage: [r.inner_voltage || ''],
          motor_amperage: [r.motor_amperage || ''],
        };
        break;
    }

    this.reportForm = this.fb.group({ ...commonControls, ...specificControls });
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
