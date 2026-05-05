import { Component } from '@angular/core';
import { FieldConfig } from '../../interfaces/field-config';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../services/toast.service';
import { jwtDecode } from 'jwt-decode';
import { DynamicForm } from '../../shared/dynamic-form/dynamic-form';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { environment } from '../../../environments/environment';
import { JwtPayload } from '../../interfaces/jwt-payload';

@Component({
  selector: 'app-customer-add',
  imports: [DynamicForm],
  templateUrl: './customer-add.html',
  styleUrl: './customer-add.scss'
})
export class CustomerAdd {
  constructor(private http: HttpClient, private toast: ToastService) { }

  formFields: FieldConfig[] = [
    {
      type: 'text',
      label: 'Nombre',
      name: 'name',
      defaultValue: ''
    },
    {
      type: 'text',
      label: 'Email',
      name: 'email',
      defaultValue: ''
    },
    {
      type: 'text',
      label: 'Identificación',
      name: 'identification',
      defaultValue: ''
    },
    {
      type: 'text',
      label: 'Telefono',
      name: 'phone',
      defaultValue: ''
    },
    {
      type: 'text',
      label: 'Observaciones',
      name: 'observation',
      defaultValue: 'N/A'
    }
  ]


  async onFormSubmit(formData: any) {
    const token = localStorage.getItem('token');
    let userId = ''
    if (token) {
      const decoded = jwtDecode<JwtPayload>(token);
      userId = decoded.sub;
      console.log('User Id del token', userId);
    }

    const payload = {
      name: formData.name,
      email: formData.email,
      identification: formData.identification,
      phone: formData.phone,
      observation: formData.observation,
      createdBy: userId // si tu API guarda quién lo creó
    };


    this.http.post(`${environment.apiUrl}customers`, payload, {
      headers: {
        'Authorization': `Bearer ${token}`
      }

    }).subscribe({
      next: (res) => {
        console.log('CLIENTE creado:', res);
        this.toast.show('Cliente registrado con éxito', 'success');

      },
      error: (err) => {
        console.log('Error al crear cliente', err);

        this.toast.show('Error al enviar cliente', 'error');
      }
    });

  }


}
