import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { TagsInput } from '../../components/tags-input/tags-input';
import { AsFormGroupPipe } from '../../../pipes/cast.pipe';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import type {
  Customer,
  CustomerSource,
  CustomerStatus,
  SaveCustomerRequest,
} from '../../../data/dtos/customer';

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
    AsFormGroupPipe,
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
  private allCustomers = select(CustomersState.items);

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
    name: ['', Validators.required],
    contactName: [''],
    email: ['', Validators.email],
    phone: [''],
    address: [''],
    tags: [[] as string[]],
    status: ['active' as CustomerStatus, Validators.required],
    source: ['other' as CustomerSource, Validators.required],
    referredByCustomerId: [''],
    contacts: this.fb.array<FormGroup>([]),
    fiscal: this.fb.nonNullable.group(
      {
        rfc: ['', rfcValidator],
        legalName: [''],
        taxRegimeCode: [''],
        fiscalZip: ['', Validators.pattern(/^\d{5}$/)],
        cfdiUseCode: [''],
        billingEmail: ['', Validators.email],
      },
      { validators: fiscalGroupValidator },
    ),
  });

  private sourceValue = toSignal(this.form.controls.source.valueChanges, {
    initialValue: this.form.controls.source.value,
  });
  protected isReferral = computed(() => this.sourceValue() === 'referral');

  /** Searchable "referred by" options — excludes self (07 §3). */
  protected referralOptions = computed(() =>
    this.allCustomers()
      .filter((c) => c.id !== this.customerId)
      .map((c) => ({ label: c.name, value: c.id })),
  );

  constructor() {
    // Options pool for referred-by + tag suggestions.
    this.store.dispatch(new LoadCustomers({ page: 1, limit: 100 }));
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

  protected addContact(initial?: {
    name?: string;
    role?: string;
    phone?: string;
    email?: string;
  }): void {
    this.contacts.push(
      this.fb.nonNullable.group({
        name: [initial?.name ?? '', Validators.required],
        role: [initial?.role ?? ''],
        phone: [initial?.phone ?? ''],
        email: [initial?.email ?? '', Validators.email],
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
    const fiscalFilled = Object.values({
      rfc: raw.fiscal.rfc,
      legalName: raw.fiscal.legalName,
      taxRegimeCode: raw.fiscal.taxRegimeCode,
      fiscalZip: raw.fiscal.fiscalZip,
      cfdiUseCode: raw.fiscal.cfdiUseCode,
    }).some((v) => String(v).trim());
    return {
      name: raw.name,
      contactName: raw.contactName || undefined,
      email: raw.email || undefined,
      phone: raw.phone || undefined,
      address: raw.address || undefined,
      tags: raw.tags,
      status: raw.status,
      source: raw.source,
      referredByCustomerId:
        raw.source === 'referral' && raw.referredByCustomerId
          ? raw.referredByCustomerId
          : undefined,
      contacts: raw.contacts as SaveCustomerRequest['contacts'],
      fiscal: fiscalFilled
        ? {
            rfc: raw.fiscal.rfc.toUpperCase(),
            legalName: raw.fiscal.legalName,
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
        referredByCustomerId: c.referredByCustomerId ?? '',
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
