import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
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
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { SkeletonModule } from 'primeng/skeleton';
import { TagModule } from 'primeng/tag';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { DateInTzPipe } from '../../../shared/pipes/date-in-tz.pipe';
import { DEFAULT_MEXICAN_TIMEZONE } from '../../../data/constants';
import { AuthState } from '../../../../state/auth/auth.state';
import { ReportsState } from '../../../../state/reports/reports.state';
import {
  LoadReport,
  UpdateReport,
  AddSignature,
  AddPictures,
  RemovePictures,
  SendReportEmail,
} from '../../../../state/reports/reports.actions';
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomer } from '../../../../state/customers/customers.actions';
import { OfflineReportsState } from '../../../../state/offline-reports/offline-reports.state';
import {
  SyncOfflineReport,
  DiscardPendingReport,
} from '../../../../state/offline-reports/offline-reports.actions';
import { OfflineReportsService } from '../../../../offline/offline-reports.service';
import type { PendingReport } from '../../../../offline/pending-report.model';
import type {
  ReportData,
  UpdateReportRequest,
  AddSignatureFields,
  SignedPayload,
} from '../../../data/dtos/report';
import type { ReportType, WorkType } from '../../../data/types/report';
import { dataUrlToFile, urlToDataUrl } from '../../../data/utils';
import type { ReportViewModel } from '../../../data/report-detail.model';
import { toViewModel, toViewModelFromPending } from '../../../data/report-detail.mapper';

pdfMake.vfs = pdfFonts.vfs;

@Component({
  selector: 'app-report-detail',
  standalone: true,
  imports: [
    DateInTzPipe,
    DecimalPipe,
    SlicePipe,
    ReactiveFormsModule,
    SignatureComponent,
    ImagePickerComponent,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    CheckboxModule,
    ButtonModule,
    DialogModule,
    SkeletonModule,
    TagModule,
  ],
  templateUrl: './report-detail.html',
  styleUrl: './report-detail.scss',
})
export class ReportDetail {
  @ViewChild('pdfContent', { static: false }) pdfContent!: ElementRef;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);
  private confirm = inject(ConfirmationService);
  private offline = inject(OfflineReportsService);
  private destroyRef = inject(DestroyRef);

  private selected = select(ReportsState.selected);
  private serverLoading = select(ReportsState.loading);
  customer = select(CustomersState.selected);
  /** Customer timezone used for every date rendered on this page (including the
   *  client-side text PDF export). Falls back to the default Mexican zone so
   *  templates never see `undefined`. */
  customerTimezone = computed(() => this.customer()?.timezone ?? DEFAULT_MEXICAN_TIMEZONE);
  private currentUser = select(AuthState.user);
  private pendingList = select(OfflineReportsState.pending);

  /** True when opened via `report/pending/:id` — the report lives in IndexedDB,
   *  not on the server, and is shown read-only with Upload/Discard actions. */
  readonly isPending = this.route.snapshot.routeConfig?.path === 'report/pending/:id';
  private pendingRecord = signal<PendingReport | null>(null);
  /** Pending-mode read from IndexedDB is async — flip to false once `loadPending`
   *  resolves (either way). Lets the page show a skeleton while we wait. */
  private pendingLoading = signal(true);
  pendingNotFound = signal(false);
  uploadingPending = signal(false);
  private pendingPictureUrls = signal<string[]>([]);
  private pendingSignature = signal<string | null>(null);
  private objectUrls: string[] = [];

  report = computed<ReportViewModel | null>(() => {
    if (this.isPending) {
      const rec = this.pendingRecord();
      return rec
        ? toViewModelFromPending(rec, this.pendingPictureUrls(), this.pendingSignature())
        : null;
    }
    const sel = this.selected();
    return sel ? toViewModel(sel.report, sel.details) : null;
  });

  /** Drives the skeleton: true while we don't have content to render yet and
   *  haven't decided this is a not-found case. */
  isLoading = computed(() =>
    this.isPending
      ? this.pendingLoading() && !this.pendingNotFound()
      : this.serverLoading() && !this.report(),
  );

  protected readonly skeletonRows = [0, 1, 2, 3];

  /** Best-effort technician display name (creator snapshot when pending). */
  reportUser = computed(() => {
    const sel = this.selected();
    const me = this.currentUser();
    if (sel && me && sel.report.assignedTo === me.id) return me;
    // Tech not in state — full user lookup requires admin access; defer.
    return null;
  });

  technicianName = computed(() =>
    this.isPending ? this.pendingRecord()?.createdBy.name ?? '' : this.reportUser()?.name ?? '',
  );

  editMode = signal(false);
  newPictures = signal<File[]>([]);
  removedPictures = signal<string[]>([]);

  /** Visibility flags for the dialogs spawned by the "Terminar y enviar" flow. */
  signModalVisible = signal(false);
  pdfDialogVisible = signal(false);

  /** Counts in-flight actions dispatched by saveChanges so the success/error
   *  handlers can settle on a single canonical toast regardless of order. */
  private pendingSave = signal(0);
  private saveErrored = signal(false);

  reportForm: FormGroup = new FormGroup({
    observations: new FormControl(''),
    unusual_noise: new FormControl(false),
  });

  constructor() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) {
      if (this.isPending) this.pendingNotFound.set(true);
      return;
    }
    if (this.isPending) {
      this.initPendingMode(id);
    } else {
      this.initServerMode(id);
    }
  }

  // ─── Initialization ───

  private initServerMode(id: string): void {
    this.subscribeToSaveOutcomes();
    this.subscribeToSignatureOutcomes();
    this.subscribeToEmailOutcomes();
    this.subscribeToReportLoaded();
    this.store.dispatch(new LoadReport(id));
  }

  /** Pending-mode wiring: load the queued report from IndexedDB, manage blob object
   *  URLs, and react to upload/discard outcomes. */
  private initPendingMode(tempId: string): void {
    this.loadPending(tempId);
    this.destroyRef.onDestroy(() => this.objectUrls.forEach((u) => URL.revokeObjectURL(u)));
    this.subscribeToPendingOutcomes(tempId);
  }

  // ─── State event subscriptions ───

  private subscribeToSaveOutcomes(): void {
    this.actions$
      .pipe(ofActionSuccessful(UpdateReport, AddPictures, RemovePictures), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.settleOneSave(false));
    this.actions$
      .pipe(ofActionErrored(UpdateReport, AddPictures, RemovePictures), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.settleOneSave(true));
  }

  private subscribeToSignatureOutcomes(): void {
    this.actions$
      .pipe(ofActionSuccessful(AddSignature), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.editMode.set(false);
        this.signModalVisible.set(false);
        this.messages.add({ severity: 'success', summary: 'Reporte firmado y enviado al cliente' });
        // Offer the PDF as a courtesy — backend already triggered the customer email.
        this.pdfDialogVisible.set(true);
      });
    this.actions$
      .pipe(ofActionErrored(AddSignature), takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.messages.add({ severity: 'error', summary: 'Ha ocurrido un error al firmar el reporte' }),
      );
  }

  private subscribeToEmailOutcomes(): void {
    this.actions$
      .pipe(ofActionSuccessful(SendReportEmail), takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.messages.add({ severity: 'success', summary: 'Reporte enviado al cliente' }),
      );
    this.actions$
      .pipe(ofActionErrored(SendReportEmail), takeUntilDestroyed(this.destroyRef))
      .subscribe(() =>
        this.messages.add({ severity: 'error', summary: 'No se pudo enviar el reporte' }),
      );
  }

  private subscribeToReportLoaded(): void {
    this.actions$
      .pipe(ofActionSuccessful(LoadReport), take(1), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const sel = this.selected();
        if (sel) this.store.dispatch(new LoadCustomer(sel.report.clientId));
      });
  }

  /** A SyncOfflineReport always "succeeds" (upload errors are caught in state), so the
   *  outcome is judged by whether the item is still queued and with what status. */
  private subscribeToPendingOutcomes(tempId: string): void {
    this.actions$
      .pipe(ofActionSuccessful(SyncOfflineReport), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const still = this.pendingList().find((p) => p.tempId === tempId);
        if (!still) {
          this.messages.add({ severity: 'success', summary: 'Reporte subido' });
          this.router.navigate(['/reports']);
        } else if (still.status === 'failed') {
          this.uploadingPending.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo subir el reporte',
            detail: still.lastError,
          });
        }
      });
    this.actions$
      .pipe(ofActionSuccessful(DiscardPendingReport), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.messages.add({ severity: 'info', summary: 'Reporte descartado' });
        this.router.navigate(['/reports']);
      });
  }

  private async loadPending(tempId: string): Promise<void> {
    try {
      const rec = await this.offline.get(tempId);
      if (!rec) {
        this.pendingNotFound.set(true);
        return;
      }
      this.pendingRecord.set(rec);
      this.pendingPictureUrls.set(
        (rec.fields.pictures ?? []).map((file) => {
          const url = URL.createObjectURL(file);
          this.objectUrls.push(url);
          return url;
        }),
      );
      if (rec.fields.signature) {
        const url = URL.createObjectURL(rec.fields.signature);
        this.objectUrls.push(url);
        this.pendingSignature.set(url);
      } else if (rec.fields.signature_base64) {
        this.pendingSignature.set(rec.fields.signature_base64);
      }
    } finally {
      this.pendingLoading.set(false);
    }
  }

  uploadPending(): void {
    const rec = this.pendingRecord();
    if (!rec || this.uploadingPending()) return;
    const me = this.currentUser();
    const run = () => {
      this.uploadingPending.set(true);
      this.store.dispatch(new SyncOfflineReport(rec.tempId));
    };
    // Phone-swap guard: warn if a different user is uploading someone else's report.
    if (me && me.id !== rec.createdBy.id) {
      this.confirm.confirm({
        header: 'Creado por otro usuario',
        message: `Este reporte fue creado por ${rec.createdBy.name}, pero la sesión actual es de ${me.name}. ¿Subir de todas formas?`,
        icon: 'pi pi-exclamation-triangle',
        acceptLabel: 'Subir',
        rejectLabel: 'Cancelar',
        accept: run,
      });
      return;
    }
    run();
  }

  discardPending(): void {
    const rec = this.pendingRecord();
    if (!rec || this.uploadingPending()) return;
    this.confirm.confirm({
      header: 'Descartar reporte',
      message: 'Se eliminará este reporte sin subirlo. Esta acción no se puede deshacer.',
      icon: 'pi pi-trash',
      acceptLabel: 'Descartar',
      rejectLabel: 'Cancelar',
      accept: () => this.store.dispatch(new DiscardPendingReport(rec.tempId)),
    });
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
      ...(formValue.work_type ? { work_type: formValue.work_type as WorkType } : {}),
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

  /** Opens the sign-and-finish modal. The modal *is* the confirmation — accepting the
   *  in-component signature commits the report. */
  openSignModal(): void {
    this.signModalVisible.set(true);
  }

  /** Fired by SignatureComponent inside the modal after the tech taps "Guardar firma".
   *  Dispatches AddSignature immediately; the backend marks the report finished and
   *  auto-emails the customer. PDF-download dialog opens on success. */
  onSignatureSaved(payload: SignedPayload | null) {
    if (!payload) return;
    const sel = this.selected();
    if (!sel) return;

    const userEmail = this.currentUser()?.email ?? 'Técnico';
    const file = dataUrlToFile(payload.dataUrl, `signature-${Date.now()}.jpg`);
    const fields: AddSignatureFields = {
      signed_by: userEmail,
      signature: file,
      signed_latitude: payload.latitude,
      signed_longitude: payload.longitude,
      signed_accuracy: payload.accuracy,
    };
    this.store.dispatch(new AddSignature(sel.report.id, fields));
  }

  /** Resends the report to the customer (backend defaults `to` to the customer email
   *  when omitted). Available only on finished reports. */
  mailReport(): void {
    const sel = this.selected();
    if (!sel) return;
    this.confirm.confirm({
      header: 'Enviar reporte al cliente',
      message: 'Se enviará una copia del reporte al correo del cliente. ¿Continuar?',
      icon: 'pi pi-envelope',
      acceptLabel: 'Enviar',
      rejectLabel: 'Cancelar',
      accept: () => this.store.dispatch(new SendReportEmail(sel.report.id, {})),
    });
  }

  onPdfDownloadAccept(): void {
    this.pdfDialogVisible.set(false);
    this.downloadTextPDF();
  }

  onPdfDownloadDecline(): void {
    this.pdfDialogVisible.set(false);
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

  async downloadTextPDF() {
    const r = this.report();
    const c = this.customer();
    const u = this.reportUser();
    if (!r || !c) return;

    const picturesBase64 = await Promise.all(
      (r.pictures || []).map((pic) => urlToDataUrl(pic).catch(() => null)),
    );
    const signatureBase64 = r.signature ? await urlToDataUrl(r.signature).catch(() => null) : null;

    const tz = this.customerTimezone();
    const formatDate = (dateString: string | null) =>
      dateString
        ? new Date(dateString).toLocaleDateString('es-MX', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: tz,
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
        signatureBase64 ? { text: 'Firma del cliente', style: 'subheader', alignment: 'center', margin: [0, 10, 0, 5] } : null,
        signatureBase64 ? { image: signatureBase64, width: 150, alignment: 'center' } : null,
        signatureBase64 ? { text: `Iniciado por: ${this.technicianName()}`, style: 'subheader', alignment: 'center' } : null,
        signatureBase64 ? { text: `Finalizado por: ${r.signed_by}`, style: 'subheader', alignment: 'center' } : null,
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
}
