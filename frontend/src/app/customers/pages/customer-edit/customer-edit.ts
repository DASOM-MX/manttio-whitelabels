import { Component, computed, effect, inject } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { Actions, Store, ofActionErrored, ofActionSuccessful, select } from '@ngxs/store';
import { map } from 'rxjs/operators';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { LoadCustomer, UpdateCustomer } from '../../../../state/customers/customers.actions';
import { CustomersState } from '../../../../state/customers/customers.state';
import { MEXICAN_STATES } from '../../../data/constants';
import type { CustomerRow, UpdateCustomerRequest } from '../../../data/dtos/customer';

const PHONE_PATTERN = /^\d{10}$/;

const EDITABLE_KEYS = [
  'name',
  'razonSocial',
  'email',
  'identification',
  'phone',
  'address',
  'state',
  'observation',
] as const satisfies readonly (keyof UpdateCustomerRequest)[];

@Component({
  selector: 'app-customer-edit',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterModule,
    ButtonModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
  ],
  templateUrl: './customer-edit.html',
  styleUrl: './customer-edit.scss',
})
export class CustomerEdit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);
  private fb = inject(FormBuilder);

  readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('id') ?? '')), {
    initialValue: this.route.snapshot.paramMap.get('id') ?? '',
  });

  readonly stateOptions = MEXICAN_STATES;

  private selected = select(CustomersState.selected);

  customer = computed<CustomerRow | null>(() => {
    const sel = this.selected();
    return sel && sel.id === this.id() ? sel : null;
  });

  form: FormGroup = this.fb.group({
    name: ['', Validators.required],
    razonSocial: [''],
    email: ['', Validators.email],
    identification: [''],
    phone: ['', Validators.pattern(PHONE_PATTERN)],
    address: [''],
    state: [null as string | null],
    observation: [''],
  });

  constructor() {
    const id = this.id();
    if (id) this.store.dispatch(new LoadCustomer(id));

    this.normalizeUppercase('razonSocial');
    this.normalizeUppercase('identification');
    this.normalizeDigits('phone', 10);

    // Repopulate (and re-mark pristine) whenever the selected customer resolves.
    effect(() => {
      const c = this.customer();
      if (!c) return;
      this.form.reset({
        name: c.name ?? '',
        razonSocial: (c.razonSocial ?? '').toUpperCase(),
        email: c.email ?? '',
        identification: (c.identification ?? '').toUpperCase(),
        phone: (c.phone ?? '').replace(/\D/g, '').slice(0, 10),
        address: c.address ?? '',
        state: c.state ?? null,
        observation: c.observation ?? '',
      });
    });

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

  onSubmit(): void {
    const id = this.id();
    if (!id || this.form.invalid) return;

    const payload: UpdateCustomerRequest = {};
    for (const key of EDITABLE_KEYS) {
      const ctrl = this.form.controls[key];
      if (!ctrl?.dirty) continue;
      const raw = ctrl.value;
      const trimmed = typeof raw === 'string' ? raw.trim() : raw;
      // Empty/null for an optional field clears nothing server-side (the backend
      // treats `undefined` as "skip"), so we just omit it from the patch.
      if (trimmed) payload[key] = trimmed as string;
    }

    if (Object.keys(payload).length === 0) {
      this.messages.add({ severity: 'info', summary: 'No hay cambios para guardar' });
      return;
    }

    this.store.dispatch(new UpdateCustomer(id, payload));
  }

  private normalizeUppercase(controlName: string): void {
    const ctrl = this.form.controls[controlName];
    ctrl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (typeof value !== 'string') return;
      const upper = value.toUpperCase();
      if (upper !== value) ctrl.setValue(upper, { emitEvent: false });
    });
  }

  private normalizeDigits(controlName: string, maxLength: number): void {
    const ctrl = this.form.controls[controlName];
    ctrl.valueChanges.pipe(takeUntilDestroyed()).subscribe((value) => {
      if (typeof value !== 'string') return;
      const digits = value.replace(/\D/g, '').slice(0, maxLength);
      if (digits !== value) ctrl.setValue(digits, { emitEvent: false });
    });
  }
}
