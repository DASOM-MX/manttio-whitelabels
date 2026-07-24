import { Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FormArray,
  FormGroup,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { MessageService } from 'primeng/api';
import {
  LucideChevronDown,
  LucideChevronUp,
  LucidePlus,
  LucideStar,
  LucideTrash2,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { CustomersState } from '../../../../state/customers/customers.state';
import {
  CreateCustomer,
  LoadCustomer,
  UpdateCustomer,
} from '../../../../state/customers/customers.actions';
import { CUSTOMER_STATUS_LABELS } from '../../../model/constants/customer/customer-status-labels.const';
import { CUSTOMER_SOURCE_LABELS } from '../../../model/constants/customer/customer-source-labels.const';
import { MANUAL_CUSTOMER_SOURCES } from '../../../model/constants/customer/manual-customer-sources.const';
import { SAT_TAX_REGIMES } from '../../../model/constants/customer/sat-tax-regimes.const';
import { SAT_CFDI_USES } from '../../../model/constants/customer/sat-cfdi-uses.const';
import { rfcValidator } from '../../../validators/rfc.validator';
import { fiscalGroupValidator } from '../../../validators/fiscal-group.validator';
import { phoneValidator } from '../../../validators/phone.validator';
import { contactsRequiredValidator } from '../../../validators/contacts-required.validator';
import { TagsInput } from '../../components/tags-input/tags-input';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { CustomerSource, CustomerStatus } from '../../../data/dtos/customer';
import type { Customer, SaveCustomerRequest } from '../../../data/dtos/customer';

/** Optional seed for a new or hydrated contact row in the form. */
interface ContactSeed {
  name?: string;
  role?: string;
  phone?: string;
  email?: string;
  isDefault?: boolean;
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
    TextareaModule,
    SelectModule,
    TagsInput,
    PageHeader,
    LucidePlus,
    LucideStar,
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

  protected customerId: string | null = this.route.snapshot.paramMap.get('id');
  protected isEdit = !!this.customerId;
  protected busy = signal(false);

  protected statusOptions = (
    Object.entries(CUSTOMER_STATUS_LABELS) as [CustomerStatus, string][]
  ).map(([value, label]) => ({ label, value }));
  protected sourceOptions = MANUAL_CUSTOMER_SOURCES.map((value) => ({
    label: CUSTOMER_SOURCE_LABELS[value],
    value,
  }));
  protected readonly SAT_TAX_REGIMES = SAT_TAX_REGIMES;
  protected readonly SAT_CFDI_USES = SAT_CFDI_USES;

  protected form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    address: ['', Validators.maxLength(250)],
    observation: ['', Validators.maxLength(1000)],
    tags: [[] as string[]],
    status: [CustomerStatus.Active, Validators.required],
    source: [CustomerSource.Other, Validators.required],
    contacts: this.fb.array<FormGroup>([], contactsRequiredValidator),
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
    if (this.customerId) this.store.dispatch(new LoadCustomer(this.customerId));
    // New customers start with one (required) contact — the primary/default.
    else this.addContact({ isDefault: true });

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
    // The first contact added is the default until the user picks another.
    const makeDefault = this.contacts.length === 0;
    this.contacts.push(
      this.fb.nonNullable.group({
        name: [initial?.name ?? '', [Validators.required, Validators.maxLength(100)]],
        role: [initial?.role ?? '', Validators.maxLength(100)],
        phone: [initial?.phone ?? '', [phoneValidator, Validators.maxLength(20)]],
        email: [initial?.email ?? '', [Validators.email, Validators.maxLength(254)]],
        isDefault: [initial?.isDefault ?? makeDefault],
      }),
    );
    if (!initial) this.form.markAsDirty();
  }

  /** Radio semantics: exactly one contact is the default (primary). */
  protected setDefault(index: number): void {
    this.contacts.controls.forEach((group, i) =>
      group.get('isDefault')!.setValue(i === index, { emitEvent: false }),
    );
    this.form.markAsDirty();
  }

  protected removeContact(index: number): void {
    const wasDefault = !!this.contacts.at(index).get('isDefault')!.value;
    this.contacts.removeAt(index);
    // Never leave the customer without a default — promote the first remaining.
    if (wasDefault && this.contacts.length) {
      this.contacts.at(0).get('isDefault')!.setValue(true, { emitEvent: false });
    }
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
      address: raw.address || undefined,
      observation: raw.observation || undefined,
      tags: raw.tags,
      status: raw.status,
      source: raw.source,
      contacts: this.contacts.controls.map((group) => {
        const c = group.getRawValue();
        return {
          name: c.name,
          role: c.role || undefined,
          phone: c.phone || undefined,
          email: c.email || undefined,
          isDefault: c.isDefault,
        };
      }),
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
        address: c.address ?? '',
        observation: c.observation ?? '',
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
    const list = c.contacts ?? [];
    if (list.length) {
      for (const contact of list) this.addContact(contact);
      // Backend returns default-first, but guard against a list with no default.
      if (!list.some((x) => x.isDefault)) {
        this.contacts.at(0).get('isDefault')!.setValue(true, { emitEvent: false });
      }
    } else {
      // Legacy customer with no contacts row — seed the required primary from the
      // denormalized customer-level fields so the edit form isn't blank.
      this.addContact({
        name: c.contactName ?? '',
        phone: c.phone ?? '',
        email: c.email ?? '',
        isDefault: true,
      });
    }
    this.form.markAsPristine();
  }
}
