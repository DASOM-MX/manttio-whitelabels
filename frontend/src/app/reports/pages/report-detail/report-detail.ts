import {
  Component,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Actions, Store, ofActionSuccessful, ofActionErrored, select } from '@ngxs/store';
import { take } from 'rxjs/operators';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SignatureComponent } from '../../components/signature-pad/signature-pad';
import { ImagePickerComponent } from '../../components/image-picker/image-picker';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DatePipe, DecimalPipe, SlicePipe } from '@angular/common';
import { AuthState } from '../../../../state/auth/auth.state';
import { ReportsState } from '../../../../state/reports/reports.state';
import {
  LoadReport,
  UpdateReport,
  AddSignature,
  AddPictures,
  RemovePictures,
} from '../../../../state/reports/reports.actions';
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomer } from '../../../../state/customers/customers.actions';
import type {
  ReportRow,
  ReportDetailRow,
  ReportData,
  UpdateReportRequest,
  AddSignatureFields,
  SignedPayload,
} from '../../../data/dtos/report';
import type { ReportType, ReportStatus } from '../../../data/types/report';

pdfMake.vfs = pdfFonts.vfs;

const DONE_STATUSES: ReportStatus[] = ['finished', 'mailed'];

interface ReportViewModel {
  id: string;
  report_type: ReportType;
  manttio_type: string;
  report_status: boolean;
  date_arrival: string | null;
  date_departure: string | null;
  signature: string | null;
  signed_by: string | null;
  signed_latitude: number | null;
  signed_longitude: number | null;
  signed_accuracy: number | null;
  signed_maps_url: string | null;
  pictures: string[];
  observations: string;
  // discriminated fields, may be undefined per report_type — read with caution
  is_operating?: boolean;
  remote_working?: boolean;
  amperage?: string;
  filter?: boolean;
  inner_voltage?: string;
  unusual_noise?: boolean;
  inner_temperature?: string;
  outer_temperature?: string;
  plc_keys_working?: boolean;
  motor_amperage?: string;
  system_pressure_1?: string;
  system_pressure_2?: string;
  system_pressure_3?: string;
  oil_pressure?: string;
  oil_level?: string;
  flux_switch_working?: boolean;
  air_band_adjustment?: boolean;
  air_good_quality?: boolean;
}

const toViewModel = (report: ReportRow, details: ReportDetailRow | null): ReportViewModel => {
  const data = (details?.data ?? {}) as Partial<ReportData>;
  const lat = report.signedLatitude;
  const lng = report.signedLongitude;
  return {
    id: report.id,
    report_type: report.reportType,
    manttio_type: report.workType ?? '',
    report_status: DONE_STATUSES.includes(report.status),
    date_arrival: report.dateArrival,
    date_departure: report.dateDeparture,
    signature: details?.signature ?? null,
    signed_by: report.signedBy,
    signed_latitude: lat,
    signed_longitude: lng,
    signed_accuracy: report.signedAccuracy,
    signed_maps_url:
      lat !== null && lng !== null
        ? `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`
        : null,
    pictures: details?.pictures ?? [],
    observations: (data as { observations?: string }).observations ?? '',
    ...data,
  };
};

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [
    DatePipe,
    DecimalPipe,
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
export class ReportDetail {
  @ViewChild('pdfContent', { static: false }) pdfContent!: ElementRef;

  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);
  private confirm = inject(ConfirmationService);

  private selected = select(ReportsState.selected);
  customer = select(CustomersState.selected);
  private currentUser = select(AuthState.user);

  report = computed<ReportViewModel | null>(() => {
    const sel = this.selected();
    return sel ? toViewModel(sel.report, sel.details) : null;
  });

  /** Best-effort technician display name. */
  reportUser = computed(() => {
    const sel = this.selected();
    const me = this.currentUser();
    if (sel && me && sel.report.assignedTo === me.id) return me;
    // Tech not in state — full user lookup requires admin access; defer.
    return null;
  });

  editMode = signal(false);
  newPictures = signal<File[]>([]);
  removedPictures = signal<string[]>([]);

  /** Counts in-flight actions dispatched by saveChanges so the success/error
   *  handlers can settle on a single canonical toast regardless of order. */
  private pendingSave = signal(0);
  private saveErrored = signal(false);

  reportForm: FormGroup = new FormGroup({
    observations: new FormControl(''),
    unusual_noise: new FormControl(false),
  });

  constructor() {
    this.actions$
      .pipe(ofActionSuccessful(UpdateReport, AddPictures, RemovePictures), takeUntilDestroyed())
      .subscribe(() => this.settleOneSave(false));

    this.actions$
      .pipe(ofActionErrored(UpdateReport, AddPictures, RemovePictures), takeUntilDestroyed())
      .subscribe(() => this.settleOneSave(true));

    this.actions$
      .pipe(ofActionSuccessful(AddSignature), takeUntilDestroyed())
      .subscribe(() => {
        this.editMode.set(false);
        this.messages.add({ severity: 'success', summary: 'Reporte firmado exitosamente' });
      });

    this.actions$
      .pipe(ofActionErrored(AddSignature), takeUntilDestroyed())
      .subscribe(() =>
        this.messages.add({ severity: 'error', summary: 'Ha ocurrido un error al firmar el reporte' }),
      );

    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.actions$
      .pipe(ofActionSuccessful(LoadReport), take(1), takeUntilDestroyed())
      .subscribe(() => {
        const sel = this.selected();
        if (sel) this.store.dispatch(new LoadCustomer(sel.report.clientId));
      });
    this.store.dispatch(new LoadReport(id));
  }

  private settleOneSave(errored: boolean) {
    if (this.pendingSave() === 0) return;
    if (errored) this.saveErrored.set(true);
    this.pendingSave.update((n) => n - 1);
    if (this.pendingSave() > 0) return;
    const failed = this.saveErrored();
    this.newPictures.set([]);
    this.removedPictures.set([]);
    this.editMode.set(false);
    this.messages.add({
      severity: failed ? 'error' : 'success',
      summary: failed ? 'No se pudieron guardar los cambios' : 'Reporte actualizado correctamente',
    });
  }

  toggleEdit() {
    this.editMode.update((v) => !v);
    if (this.editMode()) {
      this.buildReportForm();
    }
  }

  saveChanges() {
    const vm = this.report();
    const sel = this.selected();
    if (!vm || !sel) return;
    if (this.reportForm.invalid) return;

    const formValue = this.reportForm.value;
    const payload: UpdateReportRequest = {
      ...(formValue.work_type !== undefined ? { work_type: String(formValue.work_type ?? '') } : {}),
      ...(formValue.date_arrival ? { date_arrival: new Date(formValue.date_arrival).toISOString() } : {}),
      ...(formValue.date_departure ? { date_departure: new Date(formValue.date_departure).toISOString() } : {}),
      data: this.buildDataPatch(vm.report_type, formValue),
    };

    const acts: object[] = [new UpdateReport(sel.report.id, payload)];
    if (this.newPictures().length > 0) {
      acts.push(new AddPictures(sel.report.id, this.newPictures()));
    }
    if (this.removedPictures().length > 0) {
      acts.push(new RemovePictures(sel.report.id, { urls: this.removedPictures() }));
    }
    this.saveErrored.set(false);
    this.pendingSave.set(acts.length);
    this.store.dispatch(acts);
  }

  onNewPicturesSelected(files: File[]) {
    this.newPictures.set(files);
  }

  onExistingPicturesRemoved(removed: string[]) {
    this.removedPictures.update((current) => [...current, ...removed]);
  }

  onSignatureSaved(payload: SignedPayload | null) {
    if (!payload) return;
    const sel = this.selected();
    if (!sel) return;

    this.confirm.confirm({
      header: '¿Deseas firmar este reporte?',
      message: 'Una vez firmado, no podrá ser modificado.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, firmar',
      rejectLabel: 'Cancelar',
      accept: () => {
        const userEmail = this.currentUser()?.email ?? 'Técnico';
        const file = this.dataURLtoFile(payload.dataUrl, `signature-${Date.now()}.jpg`);
        const fields: AddSignatureFields = {
          signed_by: userEmail,
          signature: file,
          signed_latitude: payload.latitude,
          signed_longitude: payload.longitude,
          signed_accuracy: payload.accuracy,
        };
        this.store.dispatch(new AddSignature(sel.report.id, fields));
      },
    });
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
      (r.pictures || []).map((pic) => this.toBase64(pic).catch(() => null)),
    );
    const signatureBase64 = r.signature ? await this.toBase64(r.signature).catch(() => null) : null;

    const formatDate = (dateString: string | null) =>
      dateString
        ? new Date(dateString).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })
        : '';

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

  private getTableForReportType(reportType: ReportType, r: ReportViewModel) {
    switch (reportType) {
      case 'minisplit':
        return {
          table: {
            widths: ['25%', '25%', '25%', '25%'],
            body: [
              [{ text: 'Formulario: Mantenimiento Minisplit', colSpan: 4, alignment: 'center', fillColor: '#DCDCDC', bold: true, color: 'dark', margin: [0, 5, 0, 5] }, {}, {}, {}],
              [{ text: 'Equipo se encuentra operando', bold: true }, r.is_operating ? 'Sí' : 'No', { text: 'Cuenta con filtro evaporador', bold: true }, r.filter ? 'Sí' : 'No'],
              [{ text: 'Control remoto funciona', bold: true }, r.remote_working ? 'Sí' : 'No', { text: 'Voltaje de entrada', bold: true }, r.inner_voltage ?? ''],
              [{ text: 'Amperaje general', bold: true }, r.amperage ?? '', { text: 'Ruido fuera de lo normal', bold: true }, r.unusual_noise ? 'Sí' : 'No'],
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
              [{ text: 'Equipo se encuentra operando', bold: true }, r.is_operating ? 'Sí' : 'No', { text: 'Switch de flujo funciona', bold: true }, r.flux_switch_working ? 'Sí' : 'No'],
              [{ text: 'Temperatura de entrada', bold: true }, r.inner_temperature ?? '', { text: 'Temperatura de salida', bold: true }, r.outer_temperature ?? ''],
              [{ text: 'Teclas del PLC funcionan', bold: true }, r.plc_keys_working ? 'Sí' : 'No', { text: 'Voltaje de entrada', bold: true }, r.inner_voltage ?? ''],
              [{ text: 'Amperaje de motor condensador general', bold: true }, r.motor_amperage ?? '', { text: 'Presiones del sistema 1', bold: true }, r.system_pressure_1 ?? ''],
              [{ text: 'Presiones del sistema 2', bold: true }, r.system_pressure_2 ?? '', { text: 'Presiones del sistema 3', bold: true }, r.system_pressure_3 ?? ''],
              [{ text: 'Presión de aceite', bold: true }, r.oil_pressure ?? '', { text: 'Nivel de aceite', bold: true }, r.oil_level ?? ''],
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
              [{ text: 'Equipo se encuentra operando', bold: true }, r.is_operating ? 'Sí' : 'No', { text: 'Se ajustó la banda de la UMA', bold: true }, r.air_band_adjustment ? 'Sí' : 'No'],
              [{ text: 'Temperatura de entrada', bold: true }, r.inner_temperature ?? '', { text: 'Temperatura de salida', bold: true }, r.outer_temperature ?? ''],
              [{ text: 'Rejilla de aire en buenas condiciones', bold: true }, r.air_good_quality ? 'Sí' : 'No', { text: 'Voltaje de entrada', bold: true }, r.inner_voltage ?? ''],
              [{ text: 'Amperaje del motor', bold: true }, r.motor_amperage ?? '', { text: 'Ruido fuera de lo normal', bold: true }, r.unusual_noise ? 'Sí' : 'No'],
              [{ text: 'Observaciones', bold: true }, r.observations || 'Ninguna', { text: '', border: [false, false, false, false] }, { text: '', border: [false, false, false, false] }],
            ],
          },
          margin: [0, 10, 0, 10],
        };
    }
  }

  private buildReportForm() {
    const r = this.report();
    if (!r) return;

    const commonControls: Record<string, unknown[]> = {
      observations: [r.observations || ''],
      unusual_noise: [r.unusual_noise || false],
      work_type: [r.manttio_type || ''],
      date_arrival: [r.date_arrival || ''],
      date_departure: [r.date_departure || ''],
    };

    let specificControls: Record<string, unknown[]> = {};
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

  private buildDataPatch(reportType: ReportType, fv: Record<string, unknown>): Partial<ReportData> {
    const obs = (fv['observations'] as string | undefined) ?? '';
    const noise = !!fv['unusual_noise'];
    switch (reportType) {
      case 'minisplit':
        return {
          is_operating: !!fv['is_operating'],
          remote_working: !!fv['remote_working'],
          amperage: String(fv['amperage'] ?? ''),
          filter: !!fv['filter'],
          inner_voltage: String(fv['inner_voltage'] ?? ''),
          unusual_noise: noise,
          observations: obs,
        };
      case 'chiller':
        return {
          is_operating: !!fv['is_operating'],
          inner_temperature: String(fv['inner_temperature'] ?? ''),
          outer_temperature: String(fv['outer_temperature'] ?? ''),
          inner_voltage: String(fv['inner_voltage'] ?? ''),
          plc_keys_working: !!fv['plc_keys_working'],
          motor_amperage: String(fv['motor_amperage'] ?? ''),
          system_pressure_1: String(fv['system_pressure_1'] ?? ''),
          system_pressure_2: String(fv['system_pressure_2'] ?? ''),
          system_pressure_3: String(fv['system_pressure_3'] ?? ''),
          oil_pressure: String(fv['oil_pressure'] ?? ''),
          oil_level: String(fv['oil_level'] ?? ''),
          flux_switch_working: !!fv['flux_switch_working'],
          unusual_noise: noise,
          observations: obs,
        };
      case 'uma':
        return {
          is_operating: !!fv['is_operating'],
          air_band_adjustment: !!fv['air_band_adjustment'],
          inner_temperature: String(fv['inner_temperature'] ?? ''),
          outer_temperature: String(fv['outer_temperature'] ?? ''),
          air_good_quality: !!fv['air_good_quality'],
          inner_voltage: String(fv['inner_voltage'] ?? ''),
          motor_amperage: String(fv['motor_amperage'] ?? ''),
          unusual_noise: noise,
          observations: obs,
        };
    }
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
