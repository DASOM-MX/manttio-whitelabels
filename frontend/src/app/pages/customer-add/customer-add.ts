import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { Actions, Store, ofActionSuccessful, ofActionErrored } from '@ngxs/store';
import { FieldConfig } from '../../interfaces/field-config';
import { ToastService } from '../../../services/toast.service';
import { DynamicForm } from '../../shared/dynamic-form/dynamic-form';
import { CreateCustomer } from '../../../state/customers/customers.actions';
import type { CreateCustomerRequest } from '../../data/dtos/customer';

@Component({
  selector: 'app-customer-add',
  standalone: true,
  imports: [DynamicForm],
  templateUrl: './customer-add.html',
  styleUrl: './customer-add.scss',
})
export class CustomerAdd {
  private toast = inject(ToastService);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private router = inject(Router);

  readonly formFields: FieldConfig[] = [
    { type: 'text', label: 'Nombre', name: 'name', defaultValue: '' },
    { type: 'text', label: 'Email', name: 'email', defaultValue: '' },
    { type: 'text', label: 'Identificación', name: 'identification', defaultValue: '' },
    { type: 'text', label: 'Telefono', name: 'phone', defaultValue: '' },
    { type: 'text', label: 'Observaciones', name: 'observation', defaultValue: 'N/A' },
  ];

  constructor() {
    this.actions$
      .pipe(ofActionSuccessful(CreateCustomer), takeUntilDestroyed())
      .subscribe(() => {
        this.toast.show('Cliente registrado con éxito', 'success');
        this.router.navigate(['/customers']);
      });

    this.actions$
      .pipe(ofActionErrored(CreateCustomer), takeUntilDestroyed())
      .subscribe(() => {
        this.toast.show('Error al enviar cliente', 'error');
      });
  }

  onFormSubmit(formData: any) {
    const payload: CreateCustomerRequest = {
      name: formData.name,
      email: formData.email || undefined,
      identification: formData.identification || undefined,
      phone: formData.phone || undefined,
      observation: formData.observation || undefined,
    };
    this.store.dispatch(new CreateCustomer(payload));
  }
}
