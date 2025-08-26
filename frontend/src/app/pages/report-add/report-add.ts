import { Component, OnInit } from '@angular/core';
import { FieldConfig } from '../../shared/dynamic-form/models/field-config.model';
import { DynamicForm } from '../../shared/dynamic-form/dynamic-form';
import { CustomersService, Customer } from '../../../services/customers';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ReportsService } from '../../../services/reports';
import { jwtDecode } from 'jwt-decode';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { ToastService } from '../../../services/toast.service';


interface JwtPayload {
  sub: string;
  email?: string;
}

@Component({
  selector: 'app-report-add',
  standalone: true,
  imports: [DynamicForm, FormsModule, CommonModule],
  templateUrl: './report-add.html',
  styleUrl: './report-add.scss'
})
export class ReportAdd implements OnInit {
  selectedCustomerId: string = '';
  customers: Customer[] = [];
  selectedFiles: File[] = [];
  signatureFile: File | null = null;

  reportTypes: ['minisplit', 'chiller', 'uma'] = ['minisplit', 'chiller', 'uma'];
  selectedReportType = 'minisplit';

  //animating form change
  isAnimating = false;
  tempType: string = '';

  formConfigs: { [key: string]: any[] } = {
    minisplit: this.getFieldsForType('minisplit'),
    chiller: this.getFieldsForType('chiller'),

    uma: this.getFieldsForType('uma')

  }


  constructor(private customersService: CustomersService,
    private reportsService: ReportsService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private toast: ToastService) { }

  onReportTypeChange(newType: string) {
    this.isAnimating = true;

    setTimeout(() => {
      this.selectedReportType = newType;

      // Forzar detección de cambios
      this.cdr.detectChanges();

      setTimeout(() => {
        this.isAnimating = false;
        this.cdr.detectChanges();
      }, 0);

    }, 300);
  }

  get formFields() {
    return this.formConfigs[this.selectedReportType] || [];
  }

  getFieldsForType(type: string) {
    switch (type) {
      case 'minisplit':
        return [
          { type: 'text', label: 'Para', name: 'para', defaultValue: '' },
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
          { type: 'text', label: 'Firmado por', name: 'signed_by', defaultValue: '' }
        ];

      case 'chiller':
        return [
          { type: 'text', label: 'Para', name: 'para', defaultValue: '' },
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
          { type: 'text', label: 'Firmado por', name: 'signed_by', defaultValue: '' }
        ];

      case 'uma':
        return [
          { type: 'text', label: 'Para', name: 'para', defaultValue: '' },
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
          { type: 'text', label: 'Firmado por', name: 'signed_by', defaultValue: '' }
        ];

      default:
        return [];
    }
  }


  ngOnInit(): void {
    this.customersService.getCustomers().subscribe({
      next: (data) => {
        console.log('Clientes recibidos:', data); // <-- Aquí verificas
        this.customers = data;
        this.cdr.detectChanges(); // Asegúrate de detectar cambios después de actualizar los clientes

      },
      error: (err) => {
        console.error('Error al obtener clientes:', err);
      },
    });
  }


  onFileSelect(event: any) {
    if (event.target.files && event.target.files.length > 0) {
      //this.selectedFiles = event.target.files[0];
      this.selectedFiles = Array.from(event.target.files);
      console.log('Archivos seleccionados:', this.selectedFiles);

    }
  }

  onFilesSelected(files: File[]) {
    this.selectedFiles = files;
    console.log('Archivos recibidos desde formulario:', this.selectedFiles);
  }

  onSignatureChange(file: File) {
    this.signatureFile = file;
    console.log('Firma capturada2:', file);
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
    const token = localStorage.getItem('token');
    let userId = ''
    if (token) {
      const decoded = jwtDecode<JwtPayload>(token);
      userId = decoded.sub;
      console.log('User ID del token:', userId);
    }

    const customerId = this.selectedCustomerId;
    console.log(customerId);

    const fd = new FormData();
    fd.append('report_type', this.selectedReportType);
    Object.keys(formData).forEach(key => {
      if (key === 'signature' && formData[key]) {
        const file = this.dataURLtoFile(formData[key], `signature-${Date.now()}.jpg`);
        fd.append('signature', file);
      }
      else {
        fd.append(key, formData[key]);
      }

    });

    fd.append('user_id', userId);
    fd.append('client_id', this.selectedCustomerId);


    for (const file of this.selectedFiles) {
      fd.append('pictures', file); // Mismo nombre que en el interceptor
    }

    if (this.signatureFile) {
      fd.append('signature', this.signatureFile); // Mismo nombre que en el interceptor
    }

    this.http.post('http://localhost:3000/reports', fd, {
      headers: {
        'Authorization': `Bearer ${token}`
      }

    }).subscribe({
      next: (res) => {
        console.log('Reporte creado:', res);
        this.toast.show('Reporte guardado con éxito', 'success');

        alert('Reporte enviado correctamente');
        this.selectedFiles = [];
        this.signatureFile = null;
        this.selectedCustomerId = '';
        //this.selectedReportType =;
        this.formConfigs[this.selectedReportType] = this.getFieldsForType(this.selectedReportType);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.log('Error al crear reporte', err);

        this.toast.show('Error al enviar reporte', 'error');
      }
    });

  }

}
