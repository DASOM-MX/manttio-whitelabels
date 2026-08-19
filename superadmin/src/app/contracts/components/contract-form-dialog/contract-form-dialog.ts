import { Component, computed, inject, output, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
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
import {
  CreateContract,
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
import type { Contract } from '../../../data/dtos/contract/contract';
import type {
  ContractVisibleRole,
  UpdateContractRequest,
} from '../../../data/dtos/contract/contract-requests';

/** What the caller may pre-fill and lock (13 §6) — the order view's "Generar
 *  contrato" opens with both fixed, since a contract's client and originating
 *  job are immutable once filed. */
export interface ContractFormContext {
  customerId?: string;
  serviceOrderId?: string;
  contract?: Contract;
}

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

/** Shape-3 create/edit dialog (13 §6).
 *
 *  Create is **one request**: metadata and the document go up together, so a
 *  contract never exists without its file and an upload never orphans an object.
 *  Edit is the reverse — metadata patches on its own, and a replacement document
 *  is a second, deliberate call, because swapping the signed file is not the
 *  same act as fixing a typo in its name. */
@Component({
  selector: 'app-contract-form-dialog',
  imports: [
    ReactiveFormsModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    MultiSelectModule,
    TextareaModule,
    DatePickerModule,
    CheckboxModule,
    TagsInput,
    LucideFileUp,
    LucideX,
  ],
  templateUrl: './contract-form-dialog.html',
})
export class ContractFormDialog {
  /** Emits after create/update so parents refresh their lists. */
  readonly saved = output<void>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);
  private equipmentApi = inject(EquipmentService);

  private me = select(AuthState.me);
  /** Only owner/admin may narrow a contract's visibility (13 §4) — office may
   *  edit everything else about one it can see. */
  protected canSetVisibility = computed(() => hasRole(this.me(), ['owner', 'admin']));

  protected readonly acceptedFileTypes = ACCEPTED_FILE_TYPES;
  protected readonly visibleRoleOptions = VISIBLE_ROLE_OPTIONS;

  protected dialogOpen = signal(false);
  protected submitting = signal(false);
  protected editing = signal<Contract | null>(null);
  protected lockedCustomerId = signal<string | null>(null);
  private lockedServiceOrderId = signal<string | null>(null);

  /** The picked document. Required on create; on edit, present only when the
   *  user chose to replace the stored one. */
  protected file = signal<File | null>(null);
  protected equipmentOptions = signal<Option[]>([]);

  private customers = select(CustomersState.items);
  protected customerOptions = computed<Option[]>(() =>
    this.customers().map((c) => ({ label: c.name, value: c.id })),
  );

  protected typeOptions = (Object.entries(CONTRACT_TYPE_LABELS) as [ContractType, string][]).map(
    ([value, label]) => ({ label, value }),
  );

  protected isEditing = computed(() => this.editing() !== null);
  protected canSubmit = computed(
    () => !this.submitting() && (this.isEditing() || this.file() !== null),
  );

  protected form = this.fb.nonNullable.group({
    customerId: ['', Validators.required],
    name: ['', Validators.required],
    type: [ContractType.Guarantee, Validators.required],
    description: [''],
    validFromDate: [null as Date | null, Validators.required],
    expiryDate: [null as Date | null],
    neverExpires: [false],
    tags: [[] as string[]],
    visibleToRoles: [['office', 'technician'] as ContractVisibleRole[]],
    equipmentIds: [[] as string[]],
  });

  open(context?: ContractFormContext): void {
    const contract = context?.contract ?? null;
    const customerId = context?.customerId ?? contract?.customerId ?? '';

    this.editing.set(contract);
    this.lockedCustomerId.set(context?.customerId ?? contract?.customerId ?? null);
    this.lockedServiceOrderId.set(context?.serviceOrderId ?? contract?.serviceOrderId ?? null);

    if (!context?.customerId && !this.customers().length) {
      this.store.dispatch(new LoadCustomers({ page: 1, limit: 100 }));
    }

    this.form.reset({
      customerId,
      name: contract?.name ?? '',
      type: contract?.type ?? ContractType.Guarantee,
      description: contract?.description ?? '',
      validFromDate: parseCalendarDate(contract?.validFromDate),
      expiryDate: parseCalendarDate(contract?.expiryDate),
      // An existing contract with no expiry *is* the open-ended case; a new one
      // defaults to having one, since most agreements do.
      neverExpires: contract ? !contract.expiryDate : false,
      tags: contract?.tags ?? [],
      visibleToRoles: (contract?.visibleToRoles ?? ['office', 'technician']).filter(
        (r): r is ContractVisibleRole => r === 'office' || r === 'technician',
      ),
      equipmentIds: contract?.equipment.map((e) => e.id) ?? [],
    });

    // The client is immutable once filed — re-filing under another client would
    // orphan the audit trail — so the select locks on edit as well as when the
    // caller pre-locks it.
    if (this.lockedCustomerId() || contract) {
      this.form.controls.customerId.disable({ emitEvent: false });
    } else {
      this.form.controls.customerId.enable({ emitEvent: false });
    }

    this.file.set(null);
    this.submitting.set(false);
    this.loadEquipment(customerId);
    this.dialogOpen.set(true);
  }

  protected close(): void {
    if (this.submitting()) return;
    this.dialogOpen.set(false);
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

    const editing = this.editing();
    this.submitting.set(true);
    if (editing) this.saveEdit(editing, raw, validFromDate, expiryDate);
    else this.saveNew(raw, validFromDate, expiryDate);
  }

  private saveNew(
    raw: ReturnType<ContractFormDialog['form']['getRawValue']>,
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
            serviceOrderId: this.lockedServiceOrderId() ?? undefined,
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
        next: () => this.finish('Contrato registrado'),
        error: (err) => this.fail(err),
      });
  }

  private saveEdit(
    contract: Contract,
    raw: ReturnType<ContractFormDialog['form']['getRawValue']>,
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

    this.store.dispatch(new UpdateContract(contract.id, payload)).subscribe({
      next: () => {
        const replacement = this.file();
        if (!replacement) {
          this.finish('Contrato actualizado');
          return;
        }
        // Metadata landed; the document is a second call by design.
        this.store.dispatch(new ReplaceContractFile(contract.id, replacement)).subscribe({
          next: () => this.finish('Contrato actualizado'),
          error: (err) => this.fail(err, 'Se guardaron los datos, pero no el documento'),
        });
      },
      error: (err) => this.fail(err),
    });
  }

  private finish(summary: string): void {
    this.submitting.set(false);
    this.dialogOpen.set(false);
    this.messages.add({ severity: 'success', summary });
    this.saved.emit();
  }

  private fail(err: unknown, summary = 'No se pudo guardar el contrato'): void {
    this.submitting.set(false);
    this.messages.add({
      severity: 'error',
      summary,
      detail: errorMessage(err, 'Inténtalo de nuevo.'),
    });
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
