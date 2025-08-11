import { Component, OnInit } from '@angular/core';
import { FieldConfig } from '../../shared/dynamic-form/models/field-config.model';
import { DynamicForm } from '../../shared/dynamic-form/dynamic-form';
import { CustomersService, Customer } from '../../../services/customers';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ReportsService } from '../../../services/reports';
import { jwtDecode } from 'jwt-decode';
import { HttpClient } from '@angular/common/http';

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

  constructor(private customersService: CustomersService,
    private reportsService: ReportsService,
    private http: HttpClient) { }

  ngOnInit(): void {
    this.customersService.getCustomers().subscribe({
      next: (data) => {
        console.log('Clientes recibidos:', data); // <-- Aquí verificas
        this.customers = data;
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
      fd.append(key, formData[key]);
    });

    fd.append('user_id', userId);
    fd.append('client_id', this.selectedCustomerId);




    for (const file of this.selectedFiles) {
      fd.append('pictures', file); // Mismo nombre que en el interceptor
    }

    this.http.post('http://localhost:3000/reports', fd, {
      headers: {
        'Authorization': `Bearer ${token}`
      }

    }).subscribe({
      next: (res) => {
        console.log('Reporte creado:', res);
        alert('Reporte enviado correctamente');
      },
      error: (err) => {
        console.log('Error al crear reporte', err);
        alert('Error al enviar reporte');
      }
    });

    //----------------

    // let imageUrl = ' ';
    // if (this.selectedFile) {
    //   const fd = new FormData();
    //   fd.append('file', this.selectedFile);

    //   const uploadRes: any = await this.http
    //     .post('http://localhost:3000/upload/image', fd)
    //     .toPromise();
    //   imageUrl = uploadRes.url;
    // }

    // //const toBool = (val: string) => val === 'Sí';


    // const reportData = {
    //   ...formData,
    //   user_id: userId,
    //   client_id: customerId,
    //   pictures: imageUrl
    //   // is_operating: toBool(formData.is_operating),
    //   //remote_working: toBool(formData.remote_working),
    //   //filter: toBool(formData.filter),
    //   //unusual_noise: toBool(formData.unusual_noise),
    // };

    // //reportData.append('file')

    // this.reportsService.createReport(reportData).subscribe({
    //   next: (res) => {
    //     console.log('Reporte creado:', res);
    //     alert('Reporte enviado correctamente');
    //   },
    //   error: (err) => {
    //     console.log('Error al crear reporte', err);
    //     alert('Error al enviar reporte');
    //   }
    // })

    //---------------
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
    }
  ];

}
