import { Component, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Store } from '@ngxs/store';
import { FieldConfig } from '../../interfaces/field-config';
import { ToastService } from '../../../services/toast.service';
import { DynamicForm } from '../../shared/dynamic-form/dynamic-form';
import { environment } from '../../../environments/environment';
import { AuthState } from '../../store/auth/auth';
import { LoadCustomers } from '../../store/customers/actions/load-customers';

@Component({
  selector: 'app-customer-add',
  standalone: true,
  imports: [DynamicForm],
  templateUrl: './customer-add.html',
  styleUrl: './customer-add.scss',
})
export class CustomerAdd {
  private http = inject(HttpClient);
  private toast = inject(ToastService);
  private store = inject(Store);

  readonly formFields: FieldConfig[] = [
    { type: 'text', label: 'Nombre', name: 'name', defaultValue: '' },
    { type: 'text', label: 'Email', name: 'email', defaultValue: '' },
    { type: 'text', label: 'Identificación', name: 'identification', defaultValue: '' },
    { type: 'text', label: 'Telefono', name: 'phone', defaultValue: '' },
    { type: 'text', label: 'Observaciones', name: 'observation', defaultValue: 'N/A' },
  ];

  onFormSubmit(formData: any) {
    const token = this.store.selectSnapshot(AuthState.token);
    const userId = this.store.selectSnapshot(AuthState.user)?.id ?? '';

    const payload = {
      name: formData.name,
      email: formData.email,
      identification: formData.identification,
      phone: formData.phone,
      observation: formData.observation,
      createdBy: userId,
    };

    this.http
      .post(`${environment.apiUrl}customers`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .subscribe({
        next: () => {
          this.toast.show('Cliente registrado con éxito', 'success');
          this.store.dispatch(new LoadCustomers(true));
        },
        error: () => {
          this.toast.show('Error al enviar cliente', 'error');
        },
      });
  }
}
