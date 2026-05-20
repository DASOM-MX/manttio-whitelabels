import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DynamicForm } from '../../shared/dynamic-form/dynamic-form';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Store } from '@ngxs/store';
import Swal from 'sweetalert2';
import { environment } from '../../../environments/environment';
import { SelectModule } from 'primeng/select';
import { FieldConfig } from '../../interfaces/field-config';
import { ToastService } from '../../../services/toast.service';
import { AuthState } from '../../store/auth/auth';
import { CustomersState } from '../../../state/customers/customers.state';
import { LoadCustomers } from '../../../state/customers/customers.actions';
import { LoadReports } from '../../store/reports/actions/load-reports';

type ReportType = 'minisplit' | 'chiller' | 'uma';

@Component({
  selector: 'app-report-add',
  standalone: true,
  imports: [DynamicForm, FormsModule, SelectModule],
  templateUrl: './report-add.html',
  styleUrl: './report-add.scss',
})
export class ReportAdd implements OnInit {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private router = inject(Router);
  private store = inject(Store);

  customers = this.store.selectSignal(CustomersState.list);

  selectedCustomerId = signal('');
  selectedFiles = signal<File[]>([]);
  signatureFile = signal<File | null>(null);

  readonly reportTypeOptions: { label: string; value: ReportType }[] = [
    { label: 'Minisplit', value: 'minisplit' },
    { label: 'Chiller', value: 'chiller' },
    { label: 'UMA', value: 'uma' },
  ];

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

  ngOnInit(): void {
    this.store.dispatch(new LoadCustomers());
  }

  onReportTypeChange(newType: ReportType) {
    this.isAnimating.set(true);
    setTimeout(() => {
      this.selectedReportType.set(newType);
      setTimeout(() => this.isAnimating.set(false), 0);
    }, 300);
  }

  onFilesSelected(files: File[]) {
    this.selectedFiles.set(files);
  }

  onSignatureChange(file: File) {
    this.signatureFile.set(file);
  }

  private buildFields(type: ReportType): FieldConfig[] {
    switch (type) {
      case 'minisplit':
        return [
          { type: 'text', label: 'Tipo de tarea', name: 'manttio_type', defaultValue: '' },
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
          { type: 'text', label: 'Tipo de tarea', name: 'manttio_type', defaultValue: '' },
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
          { type: 'text', label: 'Tipo de tarea', name: 'manttio_type', defaultValue: '' },
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

  async onFormSubmit(formData: any) {
    const token = this.store.selectSnapshot(AuthState.token);
    const userId = this.store.selectSnapshot(AuthState.user)?.id ?? '';

    const fd = new FormData();
    fd.append('report_type', this.selectedReportType());
    Object.keys(formData).forEach((key) => {
      if (key === 'signature' && formData[key]) {
        const file = this.dataURLtoFile(formData[key], `signature-${Date.now()}.jpg`);
        fd.append('signature', file);
      } else {
        fd.append(key, formData[key]);
      }
    });

    fd.append('user_id', userId);
    fd.append('client_id', this.selectedCustomerId());

    for (const file of this.selectedFiles()) {
      fd.append('pictures', file);
    }

    const sig = this.signatureFile();
    if (sig) {
      fd.append('signature', sig);
    }

    if (!sig && !formData.signature) {
      const result = await Swal.fire({
        title: 'Falta firma',
        text: 'Este reporte no contiene una firma. ¿Deseas continuar sin firmar?',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Sí, continuar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
      });
      if (!result.isConfirmed) return;
    }

    this.http
      .post(`${environment.apiUrl}reports`, fd, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .subscribe({
        next: () => {
          Swal.fire({ title: 'Reporte agregado exitosamente', icon: 'success' });
          this.selectedFiles.set([]);
          this.signatureFile.set(null);
          this.selectedCustomerId.set('');
          this.store.dispatch(new LoadReports(true));
          this.router.navigate(['/reports']);
        },
        error: () => {
          this.toast.show('Error al enviar reporte', 'error');
        },
      });
  }
}
