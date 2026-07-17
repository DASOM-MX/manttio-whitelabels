import { Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  AbstractControl,
  FormArray,
  FormGroup,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import {
  LucideArrowLeft,
  LucideChevronDown,
  LucideChevronUp,
  LucidePlus,
  LucideTrash2,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { CustomersState } from '../../../../state/customers/customers.state';
import {
  CreateCustomer,
  LoadCustomer,
  LoadCustomers,
  UpdateCustomer,
} from '../../../../state/customers/customers.actions';
import { CUSTOMER_STATUS_LABELS } from '../../../model/constants/customer/customer-status-labels.const';
import { CUSTOMER_SOURCE_LABELS } from '../../../model/constants/customer/customer-source-labels.const';
import { SAT_TAX_REGIMES } from '../../../model/constants/customer/sat-tax-regimes.const';
import { SAT_CFDI_USES } from '../../../model/constants/customer/sat-cfdi-uses.const';
import { rfcValidator } from '../../../validators/rfc.validator';
import { fiscalGroupValidator } from '../../../validators/fiscal-group.validator';
import { phoneValidator } from '../../../validators/phone.validator';
import { TagsInput } from '../../components/tags-input/tags-input';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import { CustomerSource, CustomerStatus } from '../../../data/dtos/customer';
import type { Customer, SaveCustomerRequest } from '../../../data/dtos/customer';

/** Optional seed for a new or hydrated contact row in the form. */
interface ContactSeed {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
}

/** Add/edit client (07 §3): General + Contactos (repeater) + Datos fiscales
 *  (all-or-nothing). CRM status/source ship as plain selects; the richer
 *  flows (blacklist reason, timeline) are module 08's. */
@Component({
  selector: 'app-customer-form',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    InputTextModule,
    SelectModule,
    TagsInput,
    LucideArrowLeft,
    LucidePlus,
    LucideTrash2,
    LucideChevronUp,
    LucideChevronDown,
  ],
  templateUrl: './customer-form.html',
})
export class CustomerForm implements HasPendingChanges {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);

  protected selected = select(CustomersState.selected);
  protected knownTags = select(CustomersState.knownTags);

  protected customerId: string | null = this.route.snapshot.paramMap.get('id');
  protected isEdit = !!this.customerId;
  protected busy = signal(false);

  protected statusOptions = (
    Object.entries(CUSTOMER_STATUS_LABELS) as [CustomerStatus, string][]
  ).map(([value, label]) => ({ label, value }));
  protected sourceOptions = (
    Object.entries(CUSTOMER_SOURCE_LABELS) as [CustomerSource, string][]
  ).map(([value, label]) => ({ label, value }));
  protected readonly SAT_TAX_REGIMES = SAT_TAX_REGIMES;
  protected readonly SAT_CFDI_USES = SAT_CFDI_USES;

  protected form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    contactName: ['', Validators.maxLength(100)],
    email: ['', [Validators.email, Validators.maxLength(254)]],
    phone: ['', [phoneValidator, Validators.maxLength(20)]],
    address: ['', Validators.maxLength(250)],
    tags: [[] as string[]],
    status: [CustomerStatus.Active, Validators.required],
    source: [CustomerSource.Other, Validators.required],
    contacts: this.fb.array<FormGroup>([]),
    fiscal: this.fb.nonNullable.group(
      {
        rfc: ['', rfcValidator],
        legalName: ['', Validators.maxLength(150)],
        taxRegimeCode: [''],
        fiscalZip: ['', Validators.pattern(/^\d{5}$/)],
        cfdiUseCode: [''],
        billingEmail: ['', [Validators.email, Validators.maxLength(254)]],
      },
      { validators: fiscalGroupValidator },
    ),
  });

  constructor() {
    // Options pool for tag suggestions (knownTags). Generous limit until a
    // dedicated tags endpoint exists (07 open ask).
    this.store.dispatch(new LoadCustomers({ page: 1, limit: 1000 }));
    if (this.customerId) this.store.dispatch(new LoadCustomer(this.customerId));

    effect(() => {
      const c = this.selected();
      if (c && this.isEdit && c.id === this.customerId) this.hydrate(c);
    });
  }

  hasPendingChanges(): boolean {
    return this.form.dirty && !this.busy();
  }

  get contacts(): FormArray<FormGroup> {
    return this.form.controls.contacts;
  }

  protected get fiscalIncomplete(): boolean {
    return this.form.controls.fiscal.hasError('fiscalIncomplete');
  }

  protected get fiscalControls() {
    return this.form.controls.fiscal.controls;
  }

  protected addContact(initial?: ContactSeed): void {
    this.contacts.push(
      this.fb.nonNullable.group({
        name: [initial?.name ?? '', [Validators.required, Validators.maxLength(100)]],
        role: [initial?.role ?? '', Validators.maxLength(100)],
        phone: [initial?.phone ?? '', [phoneValidator, Validators.maxLength(20)]],
        email: [initial?.email ?? '', [Validators.email, Validators.maxLength(254)]],
      }),
    );
    if (!initial) this.form.markAsDirty();
  }

  protected removeContact(index: number): void {
    this.contacts.removeAt(index);
    this.form.markAsDirty();
  }

  protected moveContact(index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= this.contacts.length) return;
    const ctrl = this.contacts.at(index);
    this.contacts.removeAt(index);
    this.contacts.insert(target, ctrl);
    this.form.markAsDirty();
  }

  protected submit(): void {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    const payload = this.buildPayload();
    const action = this.customerId
      ? new UpdateCustomer(this.customerId, payload)
      : new CreateCustomer(payload);
    this.store.dispatch(action).subscribe({
      next: () => {
        this.busy.set(false);
        this.form.markAsPristine();
        this.messages.add({
          severity: 'success',
          summary: this.isEdit ? 'Cliente actualizado' : 'Cliente creado',
        });
        this.router.navigate(['/customers']);
      },
      error: (err) => {
        this.busy.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo guardar',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  private buildPayload(): SaveCustomerRequest {
    const raw = this.form.getRawValue();
    const fiscalFilled = Object.values(raw.fiscal).some((v) => String(v).trim());
    return {
      name: raw.name,
      contactName: raw.contactName || undefined,
      email: raw.email || undefined,
      phone: raw.phone || undefined,
      address: raw.address || undefined,
      tags: raw.tags,
      status: raw.status,
      source: raw.source,
      contacts: raw.contacts as SaveCustomerRequest['contacts'],
      fiscal: fiscalFilled
        ? {
            rfc: raw.fiscal.rfc.toUpperCase(),
            legalName: raw.fiscal.legalName.toUpperCase(),
            taxRegimeCode: raw.fiscal.taxRegimeCode,
            fiscalZip: raw.fiscal.fiscalZip,
            cfdiUseCode: raw.fiscal.cfdiUseCode,
            billingEmail: raw.fiscal.billingEmail || undefined,
          }
        : undefined,
    };
  }

  private hydrate(c: Customer): void {
    this.form.patchValue(
      {
        name: c.name,
        contactName: c.contactName ?? '',
        email: c.email ?? '',
        phone: c.phone ?? '',
        address: c.address ?? '',
        tags: c.tags ?? [],
        status: c.status,
        source: c.source,
        fiscal: {
          rfc: c.fiscal?.rfc ?? '',
          legalName: c.fiscal?.legalName ?? '',
          taxRegimeCode: c.fiscal?.taxRegimeCode ?? '',
          fiscalZip: c.fiscal?.fiscalZip ?? '',
          cfdiUseCode: c.fiscal?.cfdiUseCode ?? '',
          billingEmail: c.fiscal?.billingEmail ?? '',
        },
      },
      { emitEvent: false },
    );
    this.contacts.clear({ emitEvent: false });
    for (const contact of c.contacts ?? []) this.addContact(contact);
    this.form.markAsPristine();
  }
}
