import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type ValidatorFn,
} from '@angular/forms';
import { Actions, Store, ofActionSuccessful, ofActionErrored, select } from '@ngxs/store';
import { take } from 'rxjs/operators';
import { firstValueFrom } from 'rxjs';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
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
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { RadioButtonModule } from 'primeng/radiobutton';
import { DecimalPipe, SlicePipe } from '@angular/common';
import { DatePickerModule } from 'primeng/datepicker';
import { ChipModule } from 'primeng/chip';
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
import { PendingReportStatus } from '../../../../offline/pending-report.model';
import type { PendingReport } from '../../../../offline/pending-report.model';
import { TemplatesCacheService } from '../../../../offline/templates-cache.service';
import { ReportTemplatesService } from '../../../../http/report-templates.service';
import type {
  UpdateReportRequest,
  AddSignatureFields,
  SignedPayload,
  ReportCapture,
  CapturedSection,
  CapturedAnswer,
} from '../../../data/dtos/report';
import type { WorkType } from '../../../data/types/report';
import { QuestionDatatype } from '../../../data/types/report-template/question-datatype.type';
import type {
  ReportTemplate,
  TemplateQuestion,
} from '../../../data/types/report-template/report-template.types';
import type { QuestionKind } from '../../../data/types/report-template/report-template-form-view.types';
import type {
  AnswerSectionView,
  AnswerView,
} from '../../../data/types/report/report-answer-view.types';
import { dataUrlToFile, urlToDataUrl } from '../../../data/utils';
import type { ReportViewModel } from '../../../data/report-detail.model';
import { toViewModel, toViewModelFromPending } from '../../../data/report-detail.mapper';
import { gridClassesForColumns } from '../../helpers/grid-classes';
import { resolveDate } from '../../helpers/resolve-template-date';

/** Datatypes whose control is a fixed option list. They are the only ones that
 *  need the live template — everything else is fully described by the snapshot. */
const CHOICE_DATATYPES: QuestionKind[] = [
  QuestionDatatype.Select,
  QuestionDatatype.Multiselect,
  QuestionDatatype.Radio,
  QuestionDatatype.CheckboxGroup,
];

/** Datatypes whose stored value is a `string[]`. */
const MULTI_DATATYPES: QuestionKind[] = [
  QuestionDatatype.Multiselect,
  QuestionDatatype.CheckboxGroup,
];

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
    ToggleSwitchModule,
    SelectModule,
    MultiSelectModule,
    RadioButtonModule,
    DatePickerModule,
    ChipModule,
  ],
  templateUrl: './report-detail.html',
  styleUrl: './report-detail.scss',
})
export class ReportDetail {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);
  private confirm = inject(ConfirmationService);
  private offline = inject(OfflineReportsService);
  private templatesCache = inject(TemplatesCacheService);
  private templatesHttp = inject(ReportTemplatesService);
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
    return sel ? toViewModel(sel) : null;
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
    if (sel && me && sel.assignedTo === me.id) return me;
    // Tech not in state — full user lookup requires admin access; defer.
    return null;
  });

  technicianName = computed(() =>
    this.isPending ? this.pendingRecord()?.createdBy.name ?? '' : this.reportUser()?.name ?? '',
  );

  /** The live template behind this report, when it could still be resolved —
   *  cache first (a technician editing offline is the normal case), network
   *  second. Only its option lists are used; structure comes from the snapshot. */
  private liveTemplate = signal<ReportTemplate | null>(null);

  /** The snapshot flattened for rendering: grid classes, display strings and
   *  option lists resolved once per report/template change rather than per
   *  change-detection pass. Drives both read and edit mode. */
  protected readonly sectionViews = computed<AnswerSectionView[]>(() => {
    const questions = this.questionsById();
    return (this.report()?.sections ?? []).map((section) => ({
      title: section.title,
      gridClasses: gridClassesForColumns(section.columns),
      answers: section.answers.map((answer) => this.toAnswerView(answer, questions)),
    }));
  });

  private questionsById = computed(() => {
    const map = new Map<string, TemplateQuestion>();
    for (const section of this.liveTemplate()?.sections ?? []) {
      for (const question of section.questions) map.set(question.id, question);
    }
    return map;
  });

  /** True when the report has choice answers this device cannot offer a control
   *  for — the template is gone or was never cached. Edit mode says so rather
   *  than silently rendering those answers as uneditable. */
  protected readonly hasLockedAnswers = computed(() =>
    this.sectionViews().some((s) => s.answers.some((a) => !a.editable)),
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

  /** Rebuilt from the snapshot each time edit mode opens (`buildReportForm`);
   *  empty until then so the template can bind `[formGroup]` unconditionally. */
  reportForm: FormGroup = new FormGroup({});

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
        if (!sel) return;
        this.store.dispatch(new LoadCustomer(sel.clientId));
        // Finished reports are read-only, so their option lists are never needed.
        if (sel.templateId && !this.report()?.report_status) {
          void this.loadLiveTemplate(sel.templateId);
        }
      });
  }

  /** Best-effort: the option lists for choice answers. Cache first so an offline
   *  technician can still edit; network only as a fallback. Failure is not an
   *  error state — choice answers simply stay read-only (`AnswerView.editable`). */
  private async loadLiveTemplate(templateId: string): Promise<void> {
    const cached = await this.templatesCache.get(templateId).catch(() => undefined);
    if (cached) {
      this.liveTemplate.set(cached);
      return;
    }
    try {
      this.liveTemplate.set(await firstValueFrom(this.templatesHttp.get(templateId)));
    } catch {
      // Template deleted, or offline with a cold cache.
    }
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
        } else if (still.status === PendingReportStatus.Failed) {
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
    const sel = this.selected();
    if (!sel) return;
    if (this.reportForm.invalid) return;

    // The backend re-validates the whole capture, not a patch of it, so a report
    // whose snapshot lost its template link cannot be saved at all.
    const capture = this.buildCapture();
    if (!capture) {
      this.messages.add({
        severity: 'error',
        summary: 'No se pudo guardar',
        detail: 'Este reporte no tiene plantilla asociada.',
      });
      return;
    }

    const formValue = this.reportForm.value;
    const payload: UpdateReportRequest = {
      ...(formValue.work_type ? { work_type: formValue.work_type as WorkType } : {}),
      data: capture,
    };

    const acts: object[] = [new UpdateReport(sel.id, payload)];
    if (this.newPictures().length > 0) {
      acts.push(new AddPictures(sel.id, this.newPictures()));
    }
    if (this.removedPictures().length > 0) {
      acts.push(new RemovePictures(sel.id, { urls: this.removedPictures() }));
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
    this.store.dispatch(new AddSignature(sel.id, fields));
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
      accept: () => this.store.dispatch(new SendReportEmail(sel.id, {})),
    });
  }

  onPdfDownloadAccept(): void {
    this.pdfDialogVisible.set(false);
    this.downloadTextPDF();
  }

  onPdfDownloadDecline(): void {
    this.pdfDialogVisible.set(false);
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


  // ─── Snapshot → view model ───

  private toAnswerView(answer: CapturedAnswer, questions: Map<string, TemplateQuestion>): AnswerView {
    const question = questions.get(answer.questionId);
    const constraints = question?.constraints ?? {};
    const options = (question?.options ?? []).map((opt) => ({ label: opt, value: opt }));
    const isMulti = MULTI_DATATYPES.includes(answer.datatype);
    const isChoice = CHOICE_DATATYPES.includes(answer.datatype);
    return {
      questionId: answer.questionId,
      label: answer.label,
      kind: answer.datatype,
      unit: answer.unit,
      display: isMulti ? '' : this.displayValue(answer.value),
      values: isMulti && Array.isArray(answer.value) ? answer.value : [],
      checked: answer.value === true,
      editable: !isChoice || options.length > 0,
      options,
      // Absent the live template there is nothing to enforce; the captured value
      // already passed these rules once, so nothing is retroactively invalid.
      required: question?.required ?? false,
      min: constraints.min,
      max: constraints.max,
      maxLength: constraints.maxLength,
      minDate: resolveDate(constraints.minDate),
      maxDate: resolveDate(constraints.maxDate),
    };
  }

  private displayValue(value: CapturedAnswer['value']): string {
    if (value === null || value === undefined || value === '') return '—';
    return String(value);
  }

  // ─── Edit mode ───

  /** One control per captured answer, seeded from the snapshot. The snapshot's
   *  `datatype` is what decides the control's value shape — a date has to become
   *  a `Date` for `<p-datepicker>` and back to ISO on save, and a multi-value
   *  answer has to stay an array so its control's type never flips mid-edit.
   *
   *  Answers with no resolvable control (`AnswerView.editable === false`) get no
   *  control at all, so `buildCapture` falls back to their captured value. */
  private buildReportForm() {
    const controls: Record<string, unknown[]> = {
      work_type: [this.report()?.manttio_type || ''],
    };

    for (const section of this.sectionViews()) {
      for (const answer of section.answers) {
        if (!answer.editable) continue;
        controls[answer.questionId] = [this.toControlValue(answer), this.validatorsFor(answer)];
      }
    }

    this.reportForm = this.fb.group(controls);
  }

  private validatorsFor(answer: AnswerView): ValidatorFn[] {
    const validators: ValidatorFn[] = [];
    if (answer.required) validators.push(Validators.required);
    if (answer.maxLength) validators.push(Validators.maxLength(answer.maxLength));
    if (answer.min !== undefined) validators.push(Validators.min(answer.min));
    if (answer.max !== undefined) validators.push(Validators.max(answer.max));
    return validators;
  }

  private toControlValue(answer: AnswerView): unknown {
    const raw = this.capturedValue(answer.questionId);
    if (MULTI_DATATYPES.includes(answer.kind)) return Array.isArray(raw) ? raw : [];
    if (answer.kind === QuestionDatatype.Boolean) return raw === true;
    if (answer.kind === QuestionDatatype.Date) {
      const parsed = raw ? new Date(String(raw)) : null;
      return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
    }
    return raw ?? '';
  }

  private capturedValue(questionId: string): CapturedAnswer['value'] {
    for (const section of this.report()?.sections ?? []) {
      const found = section.answers.find((a) => a.questionId === questionId);
      if (found) return found.value;
    }
    return null;
  }

  /** Writes the edited values back into the snapshot shape (`06 §5.5`): the
   *  frozen `label`/`datatype`/`unit` are carried through untouched — only
   *  `value` may change — and the whole capture is re-sent, because the backend
   *  validates `ReportCapture` in full rather than merging a partial. */
  private buildCapture(): ReportCapture | null {
    const r = this.report();
    if (!r || !r.template_id) return null;

    const sections: CapturedSection[] = r.sections.map((section) => ({
      title: section.title,
      columns: section.columns,
      answers: section.answers.map((answer) => ({
        ...answer,
        value: this.editedValue(answer),
      })),
    }));

    return { templateId: r.template_id, templateName: r.report_type, sections };
  }

  private editedValue(answer: CapturedAnswer): CapturedAnswer['value'] {
    const control = this.reportForm.get(answer.questionId);
    if (!control) return answer.value; // locked answer — keep what was captured
    const value = control.value;
    if (value instanceof Date) return value.toISOString();
    return value ?? null;
  }
}
