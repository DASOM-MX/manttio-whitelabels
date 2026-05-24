import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicForm } from '../../../shared/dynamic-form/dynamic-form';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Actions, Store, ofActionSuccessful, ofActionErrored, select } from '@ngxs/store';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { DatePipe } from '@angular/common';
import { FieldConfig } from '../../../interfaces/field-config';
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
import type {
  CreateReportFields,
  ReportData,
  MinisplitData,
  ChillerData,
  UmaData,
  SignedPayload,
} from '../../../data/dtos/report';
import { WORK_TYPES, type ReportType, type WorkType } from '../../../data/types/report';

const yesNoToBool = (v: unknown): boolean => v === 'Sí' || v === true;

@Component({
  selector: 'app-report-add',
  standalone: true,
  imports: [DynamicForm, ReactiveFormsModule, SelectModule, DialogModule, ButtonModule, DatePipe],
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

  customers = select(CustomersState.list);
  private currentUser = select(AuthState.user);
  private reportRows = select(ReportsState.list);
  private draft = select(ReportDraftState.draft);

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
  signatureFile = signal<File | null>(null);
  signaturePayload = signal<SignedPayload | null>(null);

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

  constructor() {
    // Ensure a draft exists (idempotent — keeps the existing arrivalAt on re-entry).
    this.store.dispatch(new OpenReportDraft());

    // Restore meta selections from the draft (if any) into the form.
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
        this.selectedFiles.set([]);
        this.signatureFile.set(null);
        this.signaturePayload.set(null);
        this.store.dispatch(new DiscardReportDraft());
        this.router.navigate(['/reports']);
      });

    this.actions$
      .pipe(ofActionErrored(CreateReport), takeUntilDestroyed())
      .subscribe(() => {
        this.messages.add({ severity: 'error', summary: 'Error al enviar reporte' });
      });

    this.store.dispatch(new LoadCustomers());
    // Needed for the open-report warning. Backend auto-scopes technicians to their own.
    this.store.dispatch(new LoadReports());
  }

  onFilesSelected(files: File[]) {
    this.selectedFiles.set(files);
  }

  onSignatureChange(file: File) {
    this.signatureFile.set(file);
  }

  onSignaturePayloadChanged(payload: SignedPayload | null) {
    this.signaturePayload.set(payload);
  }

  private buildFields(type: ReportType): FieldConfig[] {
    switch (type) {
      case 'minisplit':
        return [
          { type: 'select', label: '¿Equipo se encuentra operando?', name: 'is_operating', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'select', label: '¿Control remoto funciona?', name: 'remote_working', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'number', label: 'Amperaje general', name: 'amperage', defaultValue: '' },
          { type: 'select', label: '¿Cuenta con filtro de evaporador?', name: 'filter', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'number', label: 'Voltaje de entrada', name: 'inner_voltage', defaultValue: '' },
          { type: 'select', label: '¿Ruido fuera de lo normal?', name: 'unusual_noise', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Observaciones', name: 'observations', defaultValue: '' },
          { type: 'image', label: 'Fotos', name: 'pictures', defaultValue: '' },
          { type: 'signature', label: 'Firma', name: 'signature', defaultValue: '' },
        ];
      case 'chiller':
        return [
          { type: 'select', label: '¿Equipo se encuentra operando?', name: 'is_operating', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'number', label: 'Temperatura de entrada', name: 'inner_temperature', defaultValue: '' },
          { type: 'number', label: 'Temperatura de salida', name: 'outer_temperature', defaultValue: '' },
          { type: 'number', label: 'Voltaje interior', name: 'inner_voltage', defaultValue: '' },
          { type: 'select', label: '¿PLC funciona?', name: 'plc_keys_working', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'number', label: 'Amperaje del motor', name: 'motor_amperage', defaultValue: '' },
          { type: 'number', label: 'Presión del sistema 1', name: 'system_pressure_1', defaultValue: '' },
          { type: 'number', label: 'Presión del sistema 2', name: 'system_pressure_2', defaultValue: '' },
          { type: 'number', label: 'Presión del sistema 3', name: 'system_pressure_3', defaultValue: '' },
          { type: 'number', label: 'Presión de aceite', name: 'oil_pressure', defaultValue: '' },
          { type: 'number', label: 'Nivel de aceite', name: 'oil_level', defaultValue: '' },
          { type: 'select', label: 'Switch de flujo funciona', name: 'flux_switch_working', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'select', label: 'Ruido inusual', name: 'unusual_noise', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Observaciones', name: 'observations', defaultValue: '' },
          { type: 'image', label: 'Fotos', name: 'pictures', defaultValue: '' },
          { type: 'signature', label: 'Firma', name: 'signature', defaultValue: '' },
        ];
      case 'uma':
        return [
          { type: 'select', label: '¿Se encuentra operando?', name: 'is_operating', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'select', label: '¿Se ajustó la banda?', name: 'air_band_adjustment', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'number', label: 'Temperatura de entrada', name: 'inner_temperature', defaultValue: '' },
          { type: 'number', label: 'Temperatura de salida', name: 'outer_temperature', defaultValue: '' },
          { type: 'select', label: 'Rejilla de aire en buenas condiciones', name: 'air_good_quality', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'number', label: 'Voltaje de entrada', name: 'inner_voltage', defaultValue: '' },
          { type: 'number', label: 'Amperaje del motor', name: 'motor_amperage', defaultValue: '' },
          { type: 'select', label: 'Ruido inusual', name: 'unusual_noise', defaultValue: '', options: ['Sí', 'No'] },
          { type: 'text', label: 'Observaciones', name: 'observations', defaultValue: '' },
          { type: 'image', label: 'Fotos', name: 'pictures', defaultValue: '' },
          { type: 'signature', label: 'Firma', name: 'signature', defaultValue: '' },
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

    const signatureBase64 = typeof formData['signature'] === 'string' ? (formData['signature'] as string) : '';
    const signatureFile = this.signatureFile();
    const hasSignature = !!signatureFile || !!signatureBase64;

    this.confirmOpenReport(() => {
      if (!hasSignature) {
        this.confirm.confirm({
          header: 'Falta firma',
          message: 'Este reporte no contiene una firma. ¿Deseas continuar sin firmar?',
          icon: 'pi pi-exclamation-triangle',
          acceptLabel: 'Sí, continuar',
          rejectLabel: 'Cancelar',
          accept: () => this.dispatchCreate(formData, signatureFile, signatureBase64),
        });
        return;
      }
      this.dispatchCreate(formData, signatureFile, signatureBase64);
    });
  }

  /** Confirms the user wants to "open" a new report. If they already have one or more
   *  unsigned reports assigned to them, the dialog mentions the most recent folio so the
   *  technician can cancel and resume it instead. */
  private confirmOpenReport(onAccept: () => void): void {
    const open = this.openReports();
    const baseMessage =
      'Esta acción abrirá un nuevo reporte y registrará la fecha de llegada actual.';
    const message = open.length
      ? `Ya tienes ${open.length === 1 ? `el reporte ${open[0]!.id} abierto` : `${open.length} reportes abiertos`}. ${baseMessage} ¿Deseas continuar?`
      : `${baseMessage} ¿Deseas continuar?`;

    this.confirm.confirm({
      header: 'Abrir nuevo reporte',
      message,
      icon: 'pi pi-info-circle',
      acceptLabel: 'Sí, abrir',
      rejectLabel: 'Cancelar',
      accept: onAccept,
    });
  }

  private dispatchCreate(
    formData: Record<string, unknown>,
    signatureFile: File | null,
    signatureBase64: string,
  ) {
    const reportType = this.selectedReportType();
    const header = this.headerForm.value as { customerId: string; workType?: WorkType };
    const payload = this.signaturePayload();
    const fields: CreateReportFields = {
      report_type: reportType,
      work_type: header.workType || undefined,
      client_id: header.customerId,
      date_arrival: this.arrivalAt(),
      data: this.buildReportData(reportType, formData),
      pictures: this.selectedFiles().length ? this.selectedFiles() : undefined,
      ...(signatureFile ? { signature: signatureFile } : {}),
      ...(!signatureFile && signatureBase64 ? { signature_base64: signatureBase64 } : {}),
      ...(payload
        ? {
            signed_latitude: payload.latitude,
            signed_longitude: payload.longitude,
            signed_accuracy: payload.accuracy,
          }
        : {}),
    };
    this.store.dispatch(new CreateReport(fields));
  }

  // ─── CanDeactivate ───

  /** Called by the deactivate guard. Resolves true to allow navigation, false to block. */
  canLeave(): boolean | Promise<boolean> {
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
