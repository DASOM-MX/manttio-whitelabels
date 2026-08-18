import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ReportTemplateForm } from '../../components/report-template-form/report-template-form';
import { SignSubmitDialog } from '../../components/sign-submit-dialog/sign-submit-dialog';
import { LeaveDraftDialog } from '../../components/leave-draft-dialog/leave-draft-dialog';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Actions, Store, ofActionSuccessful, ofActionErrored, select } from '@ngxs/store';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { DatePipe } from '@angular/common';
import { AppState } from '../../../../state/app/app.state';
import { AuthState } from '../../../../state/auth/auth.state';
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomers } from '../../../../state/customers/customers.actions';
import { ReportsState } from '../../../../state/reports/reports.state';
import { LoadReports, CreateReport } from '../../../../state/reports/reports.actions';
import { ReportDraftState } from '../../../../state/report-draft/report-draft.state';
import {
  OpenReportDraft,
  UpdateReportDraft,
  DiscardReportDraft,
} from '../../../../state/report-draft/report-draft.actions';
import { ReportTemplatesState } from '../../../../state/report-templates/report-templates.state';
import { LoadTemplatePage, PrefetchActiveTemplates } from '../../../../state/report-templates/report-templates.actions';
import { QueueOfflineReport } from '../../../../state/offline-reports/offline-reports.actions';
import type {
  CreateReportFields,
  SignedPayload,
} from '../../../data/dtos/report';
import type { ReportCapture } from '../../../data/dtos/report/report-capture.dto';
import { dataUrlToFile } from '../../../data/utils';
import { WORK_TYPES, ReportStatus, type WorkType } from '../../../data/types/report';
import type { ReportTemplate } from '../../../data/types/report-template/report-template.types';

@Component({
  selector: 'app-report-add',
  standalone: true,
  imports: [
    ReportTemplateForm,
    SignSubmitDialog,
    LeaveDraftDialog,
    ReactiveFormsModule,
    SelectModule,
    DatePipe,
  ],
  templateUrl: './report-add.html',
  styleUrl: './report-add.scss',
})
export class ReportAdd {
  private messages = inject(MessageService);
  private router = inject(Router);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private confirm = inject(ConfirmationService);
  private fb = inject(FormBuilder);

  private currentUser = select(AuthState.user);
  private reportRows = select(ReportsState.list);
  private draft = select(ReportDraftState.draft);
  private isOnline = select(AppState.isOnline);

  // Template picker state
  templateOptions = select(ReportTemplatesState.options);
  templateLoading = select(ReportTemplatesState.loading);
  hasNoActiveTemplates = select(ReportTemplatesState.hasNoActiveTemplates);
  needsFirstSync = select(ReportTemplatesState.needsFirstSync);
  private templateEntities = select(ReportTemplatesState.entities);
  private templateTotal = select(ReportTemplatesState.total);

  customers = select(CustomersState.list);

  /** Reports still belonging to the current user that have not been signed.
   *  Used to warn the technician they already have one open before creating another. */
  private openReports = computed(() => {
    const me = this.currentUser();
    if (!me) return [];
    return this.reportRows().filter(
      (r) => r.assignedTo === me.id && (r.status === ReportStatus.Created || r.status === ReportStatus.InProgress),
    );
  });

  /** Persisted "open" timestamp from the draft state. */
  arrivalAt = computed(() => this.draft()?.arrivalAt ?? new Date().toISOString());

  selectedFiles = signal<File[]>([]);

  readonly workTypeOptions: { label: string; value: WorkType }[] = WORK_TYPES.map((v) => ({
    label: v,
    value: v,
  }));

  headerForm: FormGroup = this.fb.group({
    customerId: ['', Validators.required],
    workType: [''],
  });

  templatePickerForm: FormGroup = this.fb.group({
    templateId: [''],
  });

  /** The currently selected template (if any). */
  selectedTemplate = computed(() => {
    const templateId = this.draft()?.templateId;
    if (!templateId) return null;
    return this.templateEntities()[templateId] ?? null;
  });

  // ─── Leave dialog (CanDeactivate plumbing) ───
  leaveDialogVisible = signal(false);
  private leaveResolver: ((leave: boolean) => void) | null = null;

  /** Gates the form card. Stays false until either an existing draft is resumed or the
   *  user confirms the "Abrir nuevo reporte" dialog. */
  formReady = signal(false);

  // ─── Sign-and-submit modal ───
  signModalVisible = signal(false);
  saving = signal(false);
  /** Capture snapshot held until the signature is provided. */
  private pendingCapture = signal<ReportCapture | null>(null);
  /** Set right before navigating away after a successful create. */
  private submittedSuccessfully = signal(false);

  constructor() {
    // Resume an existing draft or ask to open a new one
    const restored = this.draft();
    if (restored) {
      this.headerForm.patchValue(
        {
          customerId: restored.customerId ?? '',
          workType: restored.workType ?? '',
        },
        { emitEvent: false },
      );
      if (restored.templateId) {
        this.templatePickerForm.patchValue(
          {
            templateId: restored.templateId,
          },
          { emitEvent: false },
        );
      }
      this.formReady.set(true);
    } else {
      queueMicrotask(() => this.askOpenNewReport());
    }

    // Sync header form ↔ draft state on every change
    this.headerForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.store.dispatch(
        new UpdateReportDraft({
          customerId: v.customerId || null,
          workType: v.workType || null,
        }),
      );
    });

    // Sync template picker ↔ draft state on every change
    this.templatePickerForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      if (v.templateId) {
        this.store.dispatch(
          new UpdateReportDraft({
            templateId: v.templateId,
          }),
        );
      }
    });

    this.actions$
      .pipe(ofActionSuccessful(CreateReport), takeUntilDestroyed())
      .subscribe(() => {
        this.messages.add({ severity: 'success', summary: 'Reporte agregado exitosamente' });
        this.afterPersist();
      });

    this.actions$
      .pipe(ofActionErrored(CreateReport), takeUntilDestroyed())
      .subscribe(() => {
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error al enviar reporte' });
      });

    this.actions$
      .pipe(ofActionSuccessful(QueueOfflineReport), takeUntilDestroyed())
      .subscribe(() => {
        this.messages.add({
          severity: 'info',
          summary: 'Reporte guardado sin conexión',
          detail: 'Se subirá cuando vuelvas a tener internet',
        });
        this.afterPersist();
      });

    this.actions$
      .pipe(ofActionErrored(QueueOfflineReport), takeUntilDestroyed())
      .subscribe(() => {
        this.saving.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo guardar el reporte sin conexión',
        });
      });

    this.store.dispatch(new LoadCustomers());
    this.store.dispatch(new LoadReports());
    // Load templates and prefetch them
    this.store.dispatch(new LoadTemplatePage(1, 20));
    this.store.dispatch(new PrefetchActiveTemplates());
  }

  onFilesSelected(files: File[]) {
    this.selectedFiles.set(files);
  }

  /** Handle lazy loading of template pages. */
  onTemplateLazyLoad(event: any) {
    if (event.first === undefined) return;
    const pageSize = 20;
    const page = Math.floor(event.first / pageSize) + 1;
    this.store.dispatch(new LoadTemplatePage(page, pageSize));
  }

  onFormSubmit(capture: ReportCapture) {
    const header = this.headerForm.value as { customerId?: string; workType?: WorkType };
    if (!header.customerId) {
      this.messages.add({ severity: 'error', summary: 'Selecciona un cliente antes de enviar' });
      return;
    }
    // Hold the capture and open the signature modal
    this.pendingCapture.set(capture);
    this.signModalVisible.set(true);
  }

  onSignatureSaved(payload: SignedPayload | null): void {
    if (!payload) return;
    if (this.saving()) return;
    const capture = this.pendingCapture();
    if (!capture) return;
    this.saving.set(true);
    this.dispatchCreate(capture, payload);
  }

  private askOpenNewReport(): void {
    const open = this.openReports();
    const baseMessage =
      'Esta acción abrirá un nuevo reporte y registrará la fecha de llegada actual.';
    const message = open.length
      ? `Ya hay ${open.length === 1 ? `el reporte ${open[0]!.id} abierto` : `${open.length} reportes abiertos`}. ${baseMessage} ¿Deseas continuar?`
      : `${baseMessage} ¿Deseas continuar?`;

    this.confirm.confirm({
      header: 'Abrir nuevo reporte',
      message,
      icon: 'pi pi-info-circle',
      acceptLabel: 'Sí, abrir',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.store.dispatch(new OpenReportDraft());
        this.formReady.set(true);
      },
      reject: () => this.router.navigate(['/reports']),
    });
  }

  private dispatchCreate(capture: ReportCapture, signature: SignedPayload) {
    const header = this.headerForm.value as { customerId: string; workType?: WorkType };
    const me = this.currentUser();
    const signatureFile = dataUrlToFile(signature.dataUrl, `signature-${Date.now()}.jpg`);

    const fields: CreateReportFields = {
      template_id: capture.templateId,
      work_type: header.workType || undefined,
      client_id: header.customerId,
      date_arrival: this.arrivalAt(),
      data: capture,
      pictures: this.selectedFiles().length ? this.selectedFiles() : undefined,
      signed_by: me?.email ?? 'Técnico',
      signature: signatureFile,
      signed_latitude: signature.latitude,
      signed_longitude: signature.longitude,
      signed_accuracy: signature.accuracy,
    };

    if (this.isOnline()) {
      this.store.dispatch(new CreateReport(fields));
      return;
    }
    this.store.dispatch(
      new QueueOfflineReport(fields, {
        id: me?.id ?? '',
        name: me?.name ?? 'Desconocido',
        email: me?.email ?? '',
      }),
    );
  }

  private afterPersist(): void {
    this.selectedFiles.set([]);
    this.pendingCapture.set(null);
    this.submittedSuccessfully.set(true);
    this.store.dispatch(new DiscardReportDraft());
    this.router.navigate(['/reports']);
  }

  // ─── CanDeactivate ───

  canLeave(): boolean | Promise<boolean> {
    if (this.submittedSuccessfully()) return true;
    const v = this.headerForm.value as { customerId?: string; workType?: WorkType };
    const hasMeaningfulContent = !!v.customerId || !!v.workType;
    if (!hasMeaningfulContent) {
      this.store.dispatch(new DiscardReportDraft());
      return true;
    }
    return new Promise<boolean>((resolve) => {
      this.leaveResolver = resolve;
      this.leaveDialogVisible.set(true);
    });
  }

  onLeaveDiscard(): void {
    this.store.dispatch(new DiscardReportDraft());
    this.resolveLeave(true);
  }

  onLeaveKeep(): void {
    this.resolveLeave(true);
  }

  onLeaveCancel(): void {
    this.resolveLeave(false);
  }

  private resolveLeave(leave: boolean): void {
    this.leaveDialogVisible.set(false);
    const resolver = this.leaveResolver;
    this.leaveResolver = null;
    if (resolver) resolver(leave);
  }
}
