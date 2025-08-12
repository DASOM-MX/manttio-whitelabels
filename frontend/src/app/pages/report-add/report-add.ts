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

  constructor(private customersService: CustomersService,
    private reportsService: ReportsService,
    private http: HttpClient,
    private cdr: ChangeDetectorRef,
    private toast: ToastService) { }


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
    Object.keys(formData).forEach(key => {
      if (key === 'signature' && formData[key]) {
        const file = this.dataURLtoFile(formData[key], `signature-${Date.now()}.png`);
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
      },
      error: (err) => {
        console.log('Error al crear reporte', err);

        this.toast.show('Error al enviar reporte', 'error');
      }
    });




  }





  formFields: FieldConfig[] = [
    {
      type: 'text',
      label: 'Para',
      name: 'para',
      defaultValue: ''
    },
    {
      type: 'text',
      label: 'Tipo de tarea',
      name: 'manttio_type',
      defaultValue: 'Mantenimiento Preventivo'
    },
    {
      type: 'datetime-local',
      label: 'Fecha de llegada',
      name: 'date_arrival',
      defaultValue: ''
    },
    {
      type: 'datetime-local',
      label: 'Fecha de salida',
      name: 'date_departure',
      defaultValue: ''
    },
    {
      type: 'select',
      label: '¿Equipo se encuentra operando?',
      name: 'is_operating',
      defaultValue: '',
      options: ['Sí', 'No']
    },
    {
      type: 'select',
      label: '¿Control remoto funciona?',
      name: 'remote_working',
      defaultValue: '',
      options: ['Sí', 'No']
    },
    {
      type: 'number',
      label: 'Amperaje general',
      name: 'amperage',
      defaultValue: ''
    },
    {
      type: 'select',
      label: '¿Cuenta con filtro de evaporador?',
      name: 'filter',
      defaultValue: '',
      options: ['Sí', 'No']
    },
    {
      type: 'number',
      label: 'Voltaje de entrada',
      name: 'inner_voltage',
      defaultValue: ''
    },
    {
      type: 'select',
      label: '¿Ruido fuera de lo normal?',
      name: 'unusual_noise',
      defaultValue: '',
      options: ['Sí', 'No']
    },
    {
      type: 'text',
      label: 'Observaciones',
      name: 'observations',
      defaultValue: ''
    },
    {
      type: 'image',
      label: 'Fotos',
      name: 'pictures',
      defaultValue: ''
    },

    {
      type: 'signature',
      label: 'Firma',
      name: 'signature',
      defaultValue: ''
    }
  ];



}
