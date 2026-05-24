import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DynamicForm } from '../../../shared/dynamic-form/dynamic-form';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Actions, Store, ofActionSuccessful, ofActionErrored } from '@ngxs/store';
import { ConfirmationService, MessageService } from 'primeng/api';
import { SelectModule } from 'primeng/select';
import { FieldConfig } from '../../../interfaces/field-config';
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomers } from '../../../../state/customers/customers.actions';
import { CreateReport } from '../../../../state/reports/reports.actions';
import type {
  CreateReportFields,
  ReportData,
  MinisplitData,
  ChillerData,
  UmaData,
  SignedPayload,
} from '../../../data/dtos/report';
import type { ReportType } from '../../../data/types/report';

const yesNoToBool = (v: unknown): boolean => v === 'Sí' || v === true;

@Component({
  selector: 'app-report-add',
  standalone: true,
  imports: [DynamicForm, ReactiveFormsModule, SelectModule],
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

  customers = this.store.selectSignal(CustomersState.list);

  selectedFiles = signal<File[]>([]);
  signatureFile = signal<File | null>(null);
  signaturePayload = signal<SignedPayload | null>(null);

  readonly reportTypeOptions: { label: string; value: ReportType }[] = [
    { label: 'Minisplit', value: 'minisplit' },
    { label: 'Chiller', value: 'chiller' },
    { label: 'UMA', value: 'uma' },
  ];

  readonly workTypeOptions: { label: string; value: string }[] = [
    { label: 'Preventivo', value: 'Preventivo' },
    { label: 'Correctivo', value: 'Correctivo' },
  ];

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

  constructor() {
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
        this.headerForm.patchValue({ customerId: '', workType: '' });
        this.router.navigate(['/reports']);
      });

    this.actions$
      .pipe(ofActionErrored(CreateReport), takeUntilDestroyed())
      .subscribe(() => {
        this.messages.add({ severity: 'error', summary: 'Error al enviar reporte' });
      });

    this.store.dispatch(new LoadCustomers());
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
          { type: 'datetime-local', label: 'Fecha de llegada', name: 'date_arrival', defaultValue: '' },
          { type: 'datetime-local', label: 'Fecha de salida', name: 'date_departure', defaultValue: '' },
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
          { type: 'datetime-local', label: 'Fecha de llegada', name: 'date_arrival', defaultValue: '' },
          { type: 'datetime-local', label: 'Fecha de salida', name: 'date_departure', defaultValue: '' },
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
          { type: 'signature', label: 'Firma', name: 'signature', defaultValue: '' },
        ];
      case 'uma':
        return [
          { type: 'datetime-local', label: 'Fecha de llegada', name: 'date_arrival', defaultValue: '' },
          { type: 'datetime-local', label: 'Fecha de salida', name: 'date_departure', defaultValue: '' },
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
    const header = this.headerForm.value as { customerId?: string; workType?: string };
    if (!header.customerId) {
      this.messages.add({ severity: 'error', summary: 'Selecciona un cliente antes de enviar' });
      return;
    }

    const signatureBase64 = typeof formData['signature'] === 'string' ? (formData['signature'] as string) : '';
    const signatureFile = this.signatureFile();
    const hasSignature = !!signatureFile || !!signatureBase64;

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
  }

  private dispatchCreate(
    formData: Record<string, unknown>,
    signatureFile: File | null,
    signatureBase64: string,
  ) {
    const reportType = this.selectedReportType();
    const header = this.headerForm.value as { customerId: string; workType?: string };
    const dateArrival = (formData['date_arrival'] as string) || '';
    const dateDeparture = (formData['date_departure'] as string) || '';
    const payload = this.signaturePayload();
    const fields: CreateReportFields = {
      report_type: reportType,
      work_type: header.workType || undefined,
      client_id: header.customerId,
      date_arrival: dateArrival ? new Date(dateArrival).toISOString() : undefined,
      date_departure: dateDeparture ? new Date(dateDeparture).toISOString() : undefined,
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
}
