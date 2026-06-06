import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicForm } from '../../../shared/dynamic-form/dynamic-form';
import { SignSubmitDialog } from '../../components/sign-submit-dialog/sign-submit-dialog';
import { LeaveDraftDialog } from '../../components/leave-draft-dialog/leave-draft-dialog';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Actions, Store, ofActionSuccessful, ofActionErrored, select } from '@ngxs/store';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { DatePipe } from '@angular/common';
import { FieldConfig } from '../../../interfaces/field-config';
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
import { QueueOfflineReport } from '../../../../state/offline-reports/offline-reports.actions';
import type {
  CreateReportFields,
  ReportData,
  MinisplitData,
  ChillerData,
  UmaData,
  SignedPayload,
} from '../../../data/dtos/report';
import { dataUrlToFile } from '../../../data/utils';
import { WORK_TYPES, type ReportType, type WorkType } from '../../../data/types/report';

const yesNoToBool = (v: unknown): boolean => v === 'Sí' || v === true;

@Component({
  selector: 'app-report-add',
  standalone: true,
  imports: [
    DynamicForm,
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
  
  customers = select(CustomersState.list);
  /** Reports still belonging to the current user that have not been signed.
   *  Used to warn the technician they already have one open before creating another. */
  private openReports = computed(() => {
    const me = this.currentUser();
    if (!me) return [];
    return this.reportRows().filter(
      (r) => r.assignedTo === me.id && (r.status === 'created' || r.status === 'in-progress'),
    );
  });

  /** Persisted "open" timestamp from the draft state. Surviving page refreshes is the
   *  whole point of routing this through NGXS + storage plugin. */
  arrivalAt = computed(() => this.draft()?.arrivalAt ?? new Date().toISOString());

  selectedFiles = signal<File[]>([]);

  readonly reportTypeOptions: { label: string; value: ReportType }[] = [
    { label: 'Minisplit', value: 'minisplit' },
    { label: 'Chiller', value: 'chiller' },
    { label: 'UMA', value: 'uma' },
  ];

  readonly workTypeOptions: { label: string; value: WorkType }[] = WORK_TYPES.map((v) => ({
    label: v,
    value: v,
  }));

  headerForm: FormGroup = this.fb.group({
    reportType: ['minisplit' as ReportType],
    customerId: [''],
    workType: [''],
  });

  /**
   * Renders the currently-mounted dynamic-form for `selectedReportType()`.
   * Lags 300ms behind `headerForm.reportType` so the form can fade out,
   * remount against the new field config, and fade back in.
   */
  selectedReportType = signal<ReportType>('minisplit');
  isAnimating = signal(false);

  private formConfigs: Record<ReportType, FieldConfig[]> = {
    minisplit: this.buildFields('minisplit'),
    chiller: this.buildFields('chiller'),
    uma: this.buildFields('uma'),
  };

  formFields = computed<FieldConfig[]>(
    () => this.formConfigs[this.selectedReportType()] || [],
  );

  // ─── Leave dialog (CanDeactivate plumbing) ───
  leaveDialogVisible = signal(false);
  private leaveResolver: ((leave: boolean) => void) | null = null;

  /** Gates the form card. Stays false until either an existing draft is resumed or the
   *  user confirms the "Abrir nuevo reporte" dialog. */
  formReady = signal(false);

  // ─── Sign-and-submit modal ───
  /** Opens when the tech taps "Enviar" with a valid header. The client signs inside,
   *  which triggers the actual CreateReport dispatch (signature attached). */
  signModalVisible = signal(false);
  /** True between signature emit and CreateReport success/error. Keeps the dialog
   *  open (and locked — no X, no Escape) while the request is in flight, and
   *  swaps the signature pad for a spinner + "no cierres esta ventana" disclaimer. */
  saving = signal(false);
  /** Form payload captured at submit time, held until the signature is provided. */
  private pendingFormData = signal<Record<string, unknown> | null>(null);
  /** Set right before navigating away after a successful create so canLeave can
   *  bypass the "Reporte en progreso" prompt. */
  private submittedSuccessfully = signal(false);

  constructor() {
    // Resume an existing draft straight away; otherwise ask the technician to confirm
    // they want to open a new one before the form (and the arrivalAt timestamp) appear.
    const restored = this.draft();
    if (restored) {
      this.headerForm.patchValue(
        {
          reportType: restored.reportType,
          customerId: restored.customerId ?? '',
          workType: restored.workType ?? '',
        },
        { emitEvent: false },
      );
      this.selectedReportType.set(restored.reportType);
      this.formReady.set(true);
    } else {
      // Defer one tick so the modal renders after the initial route transition.
      queueMicrotask(() => this.askOpenNewReport());
    }

    // Sync header form ↔ draft state on every change.
    this.headerForm.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      this.store.dispatch(
        new UpdateReportDraft({
          reportType: v.reportType,
          customerId: v.customerId || null,
          workType: v.workType || null,
        }),
      );
    });

    this.headerForm.controls['reportType'].valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((newType: ReportType) => {
        this.isAnimating.set(true);
        setTimeout(() => {
          this.selectedReportType.set(newType);
          setTimeout(() => this.isAnimating.set(false), 0);
        }, 300);
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
        // Reset saving so the dialog swaps back to the signature pad and the
        // tech can re-sign + retry without leaving the page.
        this.saving.set(false);
        this.messages.add({ severity: 'error', summary: 'Error al enviar reporte' });
      });

    // Offline capture: the report was saved to IndexedDB and will upload on reconnect.
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
    // Needed for the open-report warning. Backend auto-scopes technicians to their own.
    this.store.dispatch(new LoadReports());
  }

  onFilesSelected(files: File[]) {
    this.selectedFiles.set(files);
  }

  private buildFields(type: ReportType): FieldConfig[] {
    switch (type) {
      case 'minisplit':
        return [
          { type: 'select', label: '¿Equipo se encuentra operando?', name: 'is_operating', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'select', label: '¿Control remoto funciona?', name: 'remote_working', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Amperaje general', name: 'amperage', defaultValue: '' },
          { type: 'select', label: '¿Cuenta con filtro de evaporador?', name: 'filter', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Voltaje de entrada', name: 'inner_voltage', defaultValue: '' },
          { type: 'select', label: '¿Ruido fuera de lo normal?', name: 'unusual_noise', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Observaciones', name: 'observations', defaultValue: '' },
          { type: 'image', label: 'Fotos', name: 'pictures', defaultValue: '' },
        ];
      case 'chiller':
        return [
          { type: 'select', label: '¿Equipo se encuentra operando?', name: 'is_operating', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Temperatura de entrada', name: 'inner_temperature', defaultValue: '' },
          { type: 'text', label: 'Temperatura de salida', name: 'outer_temperature', defaultValue: '' },
          { type: 'text', label: 'Voltaje interior', name: 'inner_voltage', defaultValue: '' },
          { type: 'select', label: '¿PLC funciona?', name: 'plc_keys_working', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Amperaje del motor', name: 'motor_amperage', defaultValue: '' },
          { type: 'text', label: 'Presión del sistema 1', name: 'system_pressure_1', defaultValue: '' },
          { type: 'text', label: 'Presión del sistema 2', name: 'system_pressure_2', defaultValue: '' },
          { type: 'text', label: 'Presión del sistema 3', name: 'system_pressure_3', defaultValue: '' },
          { type: 'text', label: 'Presión de aceite', name: 'oil_pressure', defaultValue: '' },
          { type: 'text', label: 'Nivel de aceite', name: 'oil_level', defaultValue: '' },
          { type: 'select', label: 'Switch de flujo funciona', name: 'flux_switch_working', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'select', label: 'Ruido inusual', name: 'unusual_noise', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Observaciones', name: 'observations', defaultValue: '' },
          { type: 'image', label: 'Fotos', name: 'pictures', defaultValue: '' },
        ];
      case 'uma':
        return [
          { type: 'select', label: '¿Se encuentra operando?', name: 'is_operating', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'select', label: '¿Se ajustó la banda?', name: 'air_band_adjustment', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Temperatura de entrada', name: 'inner_temperature', defaultValue: '' },
          { type: 'text', label: 'Temperatura de salida', name: 'outer_temperature', defaultValue: '' },
          { type: 'select', label: 'Rejilla de aire en buenas condiciones', name: 'air_good_quality', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Voltaje de entrada', name: 'inner_voltage', defaultValue: '' },
          { type: 'text', label: 'Amperaje del motor', name: 'motor_amperage', defaultValue: '' },
          { type: 'select', label: 'Ruido inusual', name: 'unusual_noise', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Observaciones', name: 'observations', defaultValue: '' },
          { type: 'image', label: 'Fotos', name: 'pictures', defaultValue: '' },
        ];
    }
  }

  private buildReportData(reportType: ReportType, formData: Record<string, unknown>): ReportData {
    switch (reportType) {
      case 'minisplit': {
        const data: MinisplitData = {
          is_operating: yesNoToBool(formData['is_operating']),
          remote_working: yesNoToBool(formData['remote_working']),
          amperage: String(formData['amperage'] ?? ''),
          filter: yesNoToBool(formData['filter']),
          inner_voltage: String(formData['inner_voltage'] ?? ''),
          unusual_noise: yesNoToBool(formData['unusual_noise']),
          observations: String(formData['observations'] ?? ''),
        };
        return data;
      }
      case 'chiller': {
        const data: ChillerData = {
          is_operating: yesNoToBool(formData['is_operating']),
          inner_temperature: String(formData['inner_temperature'] ?? ''),
          outer_temperature: String(formData['outer_temperature'] ?? ''),
          inner_voltage: String(formData['inner_voltage'] ?? ''),
          plc_keys_working: yesNoToBool(formData['plc_keys_working']),
          motor_amperage: String(formData['motor_amperage'] ?? ''),
          system_pressure_1: String(formData['system_pressure_1'] ?? ''),
          system_pressure_2: String(formData['system_pressure_2'] ?? ''),
          system_pressure_3: String(formData['system_pressure_3'] ?? ''),
          oil_pressure: String(formData['oil_pressure'] ?? ''),
          oil_level: String(formData['oil_level'] ?? ''),
          flux_switch_working: yesNoToBool(formData['flux_switch_working']),
          unusual_noise: yesNoToBool(formData['unusual_noise']),
          observations: String(formData['observations'] ?? ''),
        };
        return data;
      }
      case 'uma': {
        const data: UmaData = {
          is_operating: yesNoToBool(formData['is_operating']),
          air_band_adjustment: yesNoToBool(formData['air_band_adjustment']),
          inner_temperature: String(formData['inner_temperature'] ?? ''),
          outer_temperature: String(formData['outer_temperature'] ?? ''),
          air_good_quality: yesNoToBool(formData['air_good_quality']),
          inner_voltage: String(formData['inner_voltage'] ?? ''),
          motor_amperage: String(formData['motor_amperage'] ?? ''),
          unusual_noise: yesNoToBool(formData['unusual_noise']),
          observations: String(formData['observations'] ?? ''),
        };
        return data;
      }
    }
  }

  onFormSubmit(formData: Record<string, unknown>) {
    const header = this.headerForm.value as { customerId?: string; workType?: WorkType };
    if (!header.customerId) {
      this.messages.add({ severity: 'error', summary: 'Selecciona un cliente antes de enviar' });
      return;
    }
    // Hand off to the signature modal — CreateReport is dispatched once the client signs.
    this.pendingFormData.set(formData);
    this.signModalVisible.set(true);
  }

  /** Fired by SignatureComponent inside the sign-and-submit modal. A null payload
   *  means the canvas was cleared — wait for a real signature. The dialog stays
   *  open while the request runs; `saving` swaps in the spinner + disclaimer and
   *  locks the close controls until success (nav-away) or error (reset to retry). */
  onSignatureSaved(payload: SignedPayload | null): void {
    if (!payload) return;
    if (this.saving()) return;
    const formData = this.pendingFormData();
    if (!formData) return;
    this.saving.set(true);
    this.dispatchCreate(formData, payload);
  }

  /** Entry-time confirmation. Fires once on page load when no draft exists. Accepting
   *  stamps the arrivalAt (via OpenReportDraft) and reveals the form; cancelling
   *  navigates back to /reports so we never silently open a report. If another report
   *  is already unsigned, the message names it so the tech can resume it instead. */
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

  private dispatchCreate(formData: Record<string, unknown>, signature: SignedPayload) {
    const reportType = this.selectedReportType();
    const header = this.headerForm.value as { customerId: string; workType?: WorkType };
    const me = this.currentUser();
    const signatureFile = dataUrlToFile(signature.dataUrl, `signature-${Date.now()}.jpg`);
    const fields: CreateReportFields = {
      report_type: reportType,
      work_type: header.workType || undefined,
      client_id: header.customerId,
      date_arrival: this.arrivalAt(),
      data: this.buildReportData(reportType, formData),
      pictures: this.selectedFiles().length ? this.selectedFiles() : undefined,
      // Backend marks the report finished in one shot when signature + signed_by + coords
      // are all present (see backend/src/routes/reports.ts `markFinished`).
      signed_by: me?.email ?? 'Técnico',
      signature: signatureFile,
      signed_latitude: signature.latitude,
      signed_longitude: signature.longitude,
      signed_accuracy: signature.accuracy,
    };

    // Fallback-when-offline: with a connection we POST as usual; with none, the
    // report (incl. picture blobs and the signature File) is queued to IndexedDB
    // and uploaded on reconnect. `createdBy` is snapshotted so attribution
    // survives a phone swap.
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

  /** Shared post-persist cleanup for both the online create and the offline queue:
   *  clear staged files, drop the draft, and return to the list. The
   *  `submittedSuccessfully` flag short-circuits canLeave so the "Reporte en
   *  progreso" prompt doesn't fire on the way out. */
  private afterPersist(): void {
    this.selectedFiles.set([]);
    this.pendingFormData.set(null);
    this.submittedSuccessfully.set(true);
    this.store.dispatch(new DiscardReportDraft());
    this.router.navigate(['/reports']);
  }

  // ─── CanDeactivate ───

  /** Called by the deactivate guard. Resolves true to allow navigation, false to block. */
  canLeave(): boolean | Promise<boolean> {
    // The report was just submitted — afterPersist already cleared the draft and is
    // navigating intentionally. Don't ask the tech if they want to keep a draft.
    if (this.submittedSuccessfully()) return true;
    const v = this.headerForm.value as { customerId?: string; workType?: WorkType };
    const hasMeaningfulContent = !!v.customerId || !!v.workType;
    if (!hasMeaningfulContent) {
      // Nothing worth saving — silent discard so the next visit starts fresh.
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
    // Draft is already persisted via continuous sync — just allow the navigation.
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
