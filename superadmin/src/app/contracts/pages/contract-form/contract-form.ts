import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService } from 'primeng/api';
import { LucideFileUp, LucideX } from '@lucide/angular';
import { catchError, of } from 'rxjs';
import { select, Store } from '@ngxs/store';
import { ContractsState } from '../../../../state/contracts/contracts.state';
import {
  CreateContract,
  LoadContract,
  ReplaceContractFile,
  UpdateContract,
} from '../../../../state/contracts/contracts.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomers } from '../../../../state/customers/customers.actions';
import { EquipmentService } from '../../../services/http/equipment.service';
import { TagsInput } from '../../../customers/components/tags-input/tags-input';
import { hasRole } from '../../../guards/has-role.guard';
import { CONTRACT_TYPE_LABELS } from '../../../model/constants/contract/contract-type-labels.const';
import { ContractType } from '../../../model/enums/contract/contract-type.enum';
import { errorMessage, toCalendarDate } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import type { Contract } from '../../../data/dtos/contract/contract';
import type {
  ContractVisibleRole,
  UpdateContractRequest,
} from '../../../data/dtos/contract/contract-requests';

interface Option {
  label: string;
  value: string;
}

/** Extensions the backend allows (13 §1.2) — images are deliberately absent: a
 *  photo of a contract is not the contract. Mirrored here only so the file
 *  picker filters; the backend is the authority and answers 415. */
const ACCEPTED_FILE_TYPES =
  '.pdf,.docx,.odt,.xls,.xlsx,' +
  'application/pdf,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document,' +
  'application/vnd.oasis.opendocument.text,' +
  'application/vnd.ms-excel,' +
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const VISIBLE_ROLE_OPTIONS: { label: string; value: ContractVisibleRole }[] = [
  { label: 'Oficina', value: 'office' },
  { label: 'Técnicos', value: 'technician' },
];

const DEFAULT_VISIBLE_ROLES: ContractVisibleRole[] = ['office', 'technician'];

/** Add/edit contract (13 §6) — a **routed page**, not a dialog: filing a
 *  contract is a real record with a document, covered units and a visibility
 *  decision, and the form is expected to keep growing (renewals, amounts,
 *  signatories). A page also gives every entry point a plain link, which is
 *  what the order view's "Generar contrato" needs (CP-3): it navigates to
 *  `/contracts/new?customer=…&order=…` and the two fields lock.
 *
 *  Create is **one request**: metadata and the document go up together, so a
 *  contract never exists without its file and an upload never orphans an object.
 *  Edit is the reverse — metadata patches on its own, and a replacement document
 *  is a second, deliberate call, because swapping the signed file is not the
 *  same act as fixing a typo in its name. */
@Component({
  selector: 'app-contract-form',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    InputTextModule,
    SelectModule,
    MultiSelectModule,
    TextareaModule,
    DatePickerModule,
    CheckboxModule,
    TagsInput,
    PageHeader,
    LucideFileUp,
    LucideX,
  ],
  templateUrl: './contract-form.html',
})
export class ContractForm implements HasPendingChanges {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private equipmentApi = inject(EquipmentService);

  protected selected = select(ContractsState.selected);
  private me = select(AuthState.me);

  /** Only owner/admin may narrow a contract's visibility (13 §4) — office may
   *  edit everything else about one it can see. */
  protected canSetVisibility = computed(() => hasRole(this.me(), ['owner', 'admin']));

  protected contractId: string | null = this.route.snapshot.paramMap.get('id');
  protected isEdit = !!this.contractId;

  /** Pre-locked context from the caller (CP-3's order → contract path). */
  private presetCustomerId = this.route.snapshot.queryParamMap.get('customer');
  private presetServiceOrderId = this.route.snapshot.queryParamMap.get('order');
  /** The client is immutable once filed, so the select locks on edit too. */
  protected customerLocked = this.isEdit || !!this.presetCustomerId;

  protected readonly acceptedFileTypes = ACCEPTED_FILE_TYPES;
  protected readonly visibleRoleOptions = VISIBLE_ROLE_OPTIONS;

  protected busy = signal(false);
  /** The picked document. Required on create; on edit, present only when the
   *  user chose to replace the stored one. */
  protected file = signal<File | null>(null);
  protected equipmentOptions = signal<Option[]>([]);
  /** The stored document's name while editing — so the page can say what it
   *  would keep if you pick nothing. */
  protected currentFileName = signal<string | null>(null);

  private customers = select(CustomersState.items);
  protected customerOptions = computed<Option[]>(() =>
    this.customers().map((c) => ({ label: c.name, value: c.id })),
  );

  protected typeOptions = (Object.entries(CONTRACT_TYPE_LABELS) as [ContractType, string][]).map(
    ([value, label]) => ({ label, value }),
  );

  protected canSubmit = computed(() => !this.busy() && (this.isEdit || this.file() !== null));

  protected form = this.fb.nonNullable.group({
    customerId: ['', Validators.required],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    type: [ContractType.Guarantee, Validators.required],
    description: [''],
    validFromDate: [null as Date | null, Validators.required],
    expiryDate: [null as Date | null],
    neverExpires: [false],
    tags: [[] as string[]],
    visibleToRoles: [DEFAULT_VISIBLE_ROLES],
    equipmentIds: [[] as string[]],
  });

  constructor() {
    this.store.dispatch(new LoadCustomers({ page: 1, limit: 100 }));

    if (this.contractId) {
      this.store.dispatch(new LoadContract(this.contractId));
    } else if (this.presetCustomerId) {
      this.form.controls.customerId.setValue(this.presetCustomerId);
      this.loadEquipment(this.presetCustomerId);
    }

    if (this.customerLocked) this.form.controls.customerId.disable({ emitEvent: false });

    effect(() => {
      const contract = this.selected();
      if (contract && this.isEdit && contract.id === this.contractId) this.hydrate(contract);
    });
  }

  hasPendingChanges(): boolean {
    return (this.form.dirty || this.file() !== null) && !this.busy();
  }

  /** Covered units are client-scoped, so the pool follows the client select. */
  protected onCustomerChange(customerId: string): void {
    this.form.controls.equipmentIds.setValue([]);
    this.loadEquipment(customerId);
  }

  private loadEquipment(customerId: string): void {
    if (!customerId) {
      this.equipmentOptions.set([]);
      return;
    }
    this.equipmentApi
      .byCustomer(customerId)
      .pipe(catchError(() => of([])))
      .subscribe((units) =>
        this.equipmentOptions.set(
          units.map((unit) => ({
            value: unit.id,
            label: unit.name || [unit.brand, unit.model].filter(Boolean).join(' ') || 'Equipo',
          })),
        ),
      );
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0] ?? null;
    input.value = ''; // allow re-picking the same file
    if (picked) this.file.set(picked);
  }

  protected clearFile(): void {
    this.file.set(null);
  }

  protected submit(): void {
    if (this.form.invalid || !this.canSubmit()) return;
    const raw = this.form.getRawValue();
    const validFromDate = raw.validFromDate ? toCalendarDate(raw.validFromDate) : '';
    if (!validFromDate) return;
    const expiryDate =
      raw.neverExpires || !raw.expiryDate ? undefined : toCalendarDate(raw.expiryDate);

    this.busy.set(true);
    if (this.contractId) this.saveEdit(this.contractId, raw, validFromDate, expiryDate);
    else this.saveNew(raw, validFromDate, expiryDate);
  }

  private saveNew(
    raw: ReturnType<ContractForm['form']['getRawValue']>,
    validFromDate: string,
    expiryDate: string | undefined,
  ): void {
    const file = this.file();
    if (!file) return;
    this.store
      .dispatch(
        new CreateContract(
          {
            customerId: raw.customerId,
            serviceOrderId: this.presetServiceOrderId ?? undefined,
            name: raw.name,
            type: raw.type,
            description: raw.description || undefined,
            validFromDate,
            expiryDate,
            tags: raw.tags,
            visibleToRoles: this.canSetVisibility() ? raw.visibleToRoles : undefined,
            equipmentIds: raw.equipmentIds,
          },
          file,
        ),
      )
      .subscribe({
        next: () => this.finish('Contrato registrado', ['/contracts']),
        error: (err) => this.fail(err),
      });
  }

  private saveEdit(
    id: string,
    raw: ReturnType<ContractForm['form']['getRawValue']>,
    validFromDate: string,
    expiryDate: string | undefined,
  ): void {
    const payload: UpdateContractRequest = {
      name: raw.name,
      type: raw.type,
      description: raw.description || null,
      validFromDate,
      // `null` clears a stored expiry — `undefined` would leave it in place.
      expiryDate: expiryDate ?? null,
      tags: raw.tags,
      equipmentIds: raw.equipmentIds,
    };
    if (this.canSetVisibility()) payload.visibleToRoles = raw.visibleToRoles;

    this.store.dispatch(new UpdateContract(id, payload)).subscribe({
      next: () => {
        const replacement = this.file();
        if (!replacement) {
          this.finish('Contrato actualizado', ['/contracts', id]);
          return;
        }
        // Metadata landed; the document is a second call by design.
        this.store.dispatch(new ReplaceContractFile(id, replacement)).subscribe({
          next: () => this.finish('Contrato actualizado', ['/contracts', id]),
          error: (err) => this.fail(err, 'Se guardaron los datos, pero no el documento'),
        });
      },
      error: (err) => this.fail(err),
    });
  }

  private finish(summary: string, target: string[]): void {
    this.busy.set(false);
    this.form.markAsPristine();
    this.file.set(null);
    this.messages.add({ severity: 'success', summary });
    this.router.navigate(target);
  }

  private fail(err: unknown, summary = 'No se pudo guardar el contrato'): void {
    this.busy.set(false);
    this.messages.add({
      severity: 'error',
      summary,
      detail: errorMessage(err, 'Inténtalo de nuevo.'),
    });
  }

  private hydrate(contract: Contract): void {
    this.form.patchValue(
      {
        customerId: contract.customerId,
        name: contract.name,
        type: contract.type,
        description: contract.description ?? '',
        validFromDate: parseCalendarDate(contract.validFromDate),
        expiryDate: parseCalendarDate(contract.expiryDate),
        // A stored contract with no expiry *is* the open-ended case.
        neverExpires: !contract.expiryDate,
        tags: contract.tags ?? [],
        visibleToRoles: contract.visibleToRoles.filter(
          (r): r is ContractVisibleRole => r === 'office' || r === 'technician',
        ),
        equipmentIds: contract.equipment.map((e) => e.id),
      },
      { emitEvent: false },
    );
    this.currentFileName.set(contract.fileName);
    this.loadEquipment(contract.customerId);
    this.form.markAsPristine();
  }
}

/** `YYYY-MM-DD` → a local-midnight Date for the picker. Splitting the parts
 *  avoids `new Date('2026-08-18')`, which parses as UTC and renders as the
 *  previous day west of Greenwich. */
const parseCalendarDate = (value: string | undefined): Date | null => {
  if (!value) return null;
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
};
