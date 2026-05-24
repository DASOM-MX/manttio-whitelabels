import { Component, computed, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Actions, Store, ofActionErrored, ofActionSuccessful, select } from '@ngxs/store';
import { map } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { FieldConfig } from '../../../interfaces/field-config';
import { DynamicForm } from '../../../shared/dynamic-form/dynamic-form';
import { LoadCustomer, UpdateCustomer } from '../../../../state/customers/customers.actions';
import { CustomersState } from '../../../../state/customers/customers.state';
import { MEXICAN_STATES } from '../../../../data/constants';
import type { CustomerRow, UpdateCustomerRequest } from '../../../data/dtos/customer';

@Component({
  selector: 'app-customer-edit',
  standalone: true,
  imports: [RouterModule, DynamicForm, ButtonModule],
  templateUrl: './customer-edit.html',
  styleUrl: './customer-edit.scss',
})
export class CustomerEdit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);

  readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });

  private selected = select(CustomersState.selected);

  customer = computed<CustomerRow | null>(() => {
    const sel = this.selected();
    return sel && sel.id === this.id() ? sel : null;
  });

  formFields = computed<FieldConfig[] | null>(() => {
    const c = this.customer();
    if (!c) return null;
    return [
      { type: 'text', label: 'Nombre', name: 'name', defaultValue: c.name ?? '' },
      { type: 'text', label: 'Razón social', name: 'razonSocial', defaultValue: c.razonSocial ?? '' },
      { type: 'text', label: 'Email', name: 'email', defaultValue: c.email ?? '' },
      { type: 'text', label: 'Identificación (RFC)', name: 'identification', defaultValue: c.identification ?? '' },
      { type: 'text', label: 'Teléfono', name: 'phone', defaultValue: c.phone ?? '' },
      { type: 'text', label: 'Dirección', name: 'address', defaultValue: c.address ?? '' },
      { type: 'select', label: 'Estado', name: 'state', defaultValue: c.state ?? '', options: MEXICAN_STATES },
      { type: 'text', label: 'Observaciones', name: 'observation', defaultValue: c.observation ?? '' },
    ];
  });

  constructor() {
    const id = this.id();
    if (id) this.store.dispatch(new LoadCustomer(id));

    this.actions$
      .pipe(ofActionSuccessful(UpdateCustomer), takeUntilDestroyed())
      .subscribe(() => {
        this.messages.add({ severity: 'success', summary: 'Cliente actualizado' });
        this.router.navigate(['/customers']);
      });

    this.actions$
      .pipe(ofActionErrored(UpdateCustomer), takeUntilDestroyed())
      .subscribe(() => {
        this.messages.add({ severity: 'error', summary: 'No se pudo actualizar el cliente' });
      });
  }

  onFormSubmit(formData: any): void {
    const id = this.id();
    if (!id) return;
    const payload: UpdateCustomerRequest = {
      name: formData.name,
      email: formData.email || undefined,
      identification: formData.identification || undefined,
      phone: formData.phone || undefined,
      observation: formData.observation || undefined,
      address: formData.address || undefined,
      state: formData.state || undefined,
      razonSocial: formData.razonSocial || undefined,
    };
    this.store.dispatch(new UpdateCustomer(id, payload));
  }
}
