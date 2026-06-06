import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Actions, Store, ofActionSuccessful, ofActionErrored } from '@ngxs/store';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { CreateCustomer } from '../../../../state/customers/customers.actions';
import type { CreateCustomerRequest } from '../../../data/dtos/customer';
import { DEFAULT_MEXICAN_TIMEZONE, MEXICAN_STATES, MEXICAN_TIMEZONES } from '../../../data/constants';

@Component({
  selector: 'app-customer-add',
  standalone: true,
  imports: [ReactiveFormsModule, ButtonModule, InputTextModule, SelectModule, TextareaModule],
  templateUrl: './customer-add.html',
  styleUrl: './customer-add.scss',
})
export class CustomerAdd {
  private messages = inject(MessageService);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  readonly stateOptions = MEXICAN_STATES;
  readonly timezoneOptions = MEXICAN_TIMEZONES;

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    razonSocial: [''],
    email: ['', Validators.email],
    identification: [''],
    phone: [''],
    address: [''],
    state: [null as string | null],
    timezone: [DEFAULT_MEXICAN_TIMEZONE as string, Validators.required],
    observation: [''],
  });

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

  onSubmit(): void {
    if (this.form.invalid) return;
    const v: Partial<Record<keyof CreateCustomerRequest, string | null>> = this.form.value;
    const trim = (s: string | null | undefined): string | undefined => {
      const t = typeof s === 'string' ? s.trim() : '';
      return t || undefined;
    };
    const payload: CreateCustomerRequest = {
      name: (v.name ?? '').trim(),
      razonSocial: trim(v.razonSocial),
      email: trim(v.email),
      identification: trim(v.identification),
      phone: trim(v.phone),
      address: trim(v.address),
      state: v.state || undefined,
      timezone: v.timezone || undefined,
      observation: trim(v.observation),
    };
    this.store.dispatch(new CreateCustomer(payload));
  }
}
