import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Actions, Store, ofActionSuccessful, ofActionErrored } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { FieldConfig } from '../../../interfaces/field-config';
import { DynamicForm } from '../../../shared/dynamic-form/dynamic-form';
import { CreateCustomer } from '../../../../state/customers/customers.actions';
import type { CreateCustomerRequest } from '../../../data/dtos/customer';
import { MEXICAN_STATES } from '../../../../data/constants';

@Component({
  selector: 'app-customer-add',
  standalone: true,
  imports: [DynamicForm],
  templateUrl: './customer-add.html',
  styleUrl: './customer-add.scss',
})
export class CustomerAdd {
  private messages = inject(MessageService);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private router = inject(Router);

  readonly formFields: FieldConfig[] = [
    { type: 'text', label: 'Nombre', name: 'name', defaultValue: '' },
    { type: 'text', label: 'Razón social', name: 'razonSocial', defaultValue: '' },
    { type: 'text', label: 'Email', name: 'email', defaultValue: '' },
    { type: 'text', label: 'Identificación (RFC)', name: 'identification', defaultValue: '' },
    { type: 'text', label: 'Teléfono', name: 'phone', defaultValue: '' },
    { type: 'text', label: 'Dirección', name: 'address', defaultValue: '' },
    { type: 'select', label: 'Estado', name: 'state', defaultValue: '', options: MEXICAN_STATES },
    { type: 'text', label: 'Observaciones', name: 'observation', defaultValue: 'N/A' },
  ];

  constructor() {
    this.actions$
      .pipe(ofActionSuccessful(CreateCustomer), takeUntilDestroyed())
      .subscribe(() => {
        this.messages.add({ severity: 'success', summary: 'Cliente registrado con éxito' });
        this.router.navigate(['/customers']);
      });

    this.actions$
      .pipe(ofActionErrored(CreateCustomer), takeUntilDestroyed())
      .subscribe(() => {
        this.messages.add({ severity: 'error', summary: 'Error al enviar cliente' });
      });
  }

  onFormSubmit(formData: any) {
    const payload: CreateCustomerRequest = {
      name: formData.name,
      email: formData.email || undefined,
      identification: formData.identification || undefined,
      phone: formData.phone || undefined,
      observation: formData.observation || undefined,
      address: formData.address || undefined,
      state: formData.state || undefined,
      razonSocial: formData.razonSocial || undefined,
    };
    this.store.dispatch(new CreateCustomer(payload));
  }
}
