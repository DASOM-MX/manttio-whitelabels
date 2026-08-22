import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { CheckboxModule } from 'primeng/checkbox';
import { MessageService, type ScrollerOptions } from 'primeng/api';
import { LucideFileUp, LucideX } from '@lucide/angular';
import { catchError, debounceTime, distinctUntilChanged, of, Subject } from 'rxjs';
import { select, Store } from '@ngxs/store';
import { ContractsState } from '../../../../state/contracts/contracts.state';
import {
  CreateContract,
  LoadContract,
  ReplaceContractFile,
  UpdateContract,
} from '../../../../state/contracts/contracts.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { EquipmentService } from '../../../services/http/equipment.service';
import { CustomersService } from '../../../services/http/customers.service';
import { ServiceOrdersService } from '../../../services/http/service-orders.service';
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

/** Clients arrive 65 at a time as the overlay scrolls (owner 2026-08-18) — the
 *  roster runs to 1000+ rows on a real tenant, and loading all of it to open a
 *  form is the thing this avoids. `p-select`'s lazy virtual scroll asks for the
 *  visible window; we translate that window into pages and fill the slots. */
const CUSTOMER_PAGE_SIZE = 65;
const CUSTOMER_ROW_HEIGHT = 40;
const SEARCH_DEBOUNCE_MS = 300;
/** Slot text before its page arrives — the scroller sizes rows off the array,
 *  so every index must hold something from the start. */
const CUSTOMER_PLACEHOLDER: Option = { label: '…', value: '' };

/** The row window the virtual scroller asks for. */
interface ScrollerLazyLoadEvent {
  first: number;
  last: number;
}

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
  styleUrl: './contract-form.scss',
})
export class ContractForm implements HasPendingChanges {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private equipmentApi = inject(EquipmentService);
  private customersApi = inject(CustomersService);
  private ordersApi = inject(ServiceOrdersService);

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

  /** The chosen client's name — the read-only display when the field is locked
   *  (edit, or pre-locked by a caller), where there is no select to render. */
  protected customerName = signal<string | null>(null);

  /** The generating order, when there is one. Shown read-only rather than left
   *  as a silent hidden field: "Generar contrato" locks the job this document
   *  belongs to, and the person filing it should see which one. Immutable like
   *  the client — re-filing under another order would orphan the trail. */
  protected lockedOrderId = signal<string | null>(this.presetServiceOrderId);
  protected lockedOrderFolio = signal<string | null>(null);

  /** Sparse: sized to the roster's total on first load, filled page by page as
   *  the overlay scrolls. */
  protected customerOptions = signal<Option[]>([]);
  private loadedCustomerPages = new Set<number>();
  private customerSearch = new Subject<string>();
  protected readonly customerRowHeight = CUSTOMER_ROW_HEIGHT;
  protected readonly customerScrollOptions: ScrollerOptions = {
    delay: 250,
    showLoader: true,
    lazy: true,
    onLazyLoad: (event: ScrollerLazyLoadEvent) => this.onCustomersLazyLoad(event),
  };

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
    if (this.contractId) {
      this.store.dispatch(new LoadContract(this.contractId));
    } else if (this.presetCustomerId) {
      this.form.controls.customerId.setValue(this.presetCustomerId);
      this.loadEquipment(this.presetCustomerId);
      // Pre-locked by a caller: one read for the name, since the locked field
      // shows text rather than a select.
      this.customersApi
        .get(this.presetCustomerId)
        .pipe(catchError(() => of(null)))
        .subscribe((customer) => this.customerName.set(customer?.name ?? null));
    }

    if (!this.contractId && this.presetServiceOrderId) {
      // One read for the folio — the locked row shows the job, not a uuid.
      this.ordersApi
        .get(this.presetServiceOrderId)
        .pipe(catchError(() => of(null)))
        .subscribe((res) => this.lockedOrderFolio.set(res?.order.folio ?? null));
    }

    // Only the unlocked field renders a select worth seeding.
    if (!this.customerLocked) {
      this.seedCustomers();
      this.customerSearch
        .pipe(debounceTime(SEARCH_DEBOUNCE_MS), distinctUntilChanged(), takeUntilDestroyed())
        .subscribe((term) => this.searchCustomers(term));
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

  /** Covered units are client-scoped, so the pool follows the chosen client. */
  protected onCustomerChange(customerId: string): void {
    this.form.controls.equipmentIds.setValue([]);
    this.loadEquipment(customerId);
  }

  /** First page doubles as the roster's size probe: `total` fixes the array
   *  length, so the scrollbar is honest before the rest has been fetched. */
  private seedCustomers(): void {
    this.loadedCustomerPages.clear();
    this.loadedCustomerPages.add(1);
    this.customersApi
      .list({ page: 1, limit: CUSTOMER_PAGE_SIZE })
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        if (!res) {
          this.loadedCustomerPages.delete(1);
          return;
        }
        const options: Option[] = new Array(res.total).fill(CUSTOMER_PLACEHOLDER);
        this.fill(options, 1, res.items);
        this.customerOptions.set(options);
      });
  }

  /** The scroller reports a row window; a window can straddle two pages. */
  private onCustomersLazyLoad(event: ScrollerLazyLoadEvent): void {
    const firstPage = Math.floor(event.first / CUSTOMER_PAGE_SIZE) + 1;
    const lastRow = Math.max(event.last - 1, event.first);
    const lastPage = Math.floor(lastRow / CUSTOMER_PAGE_SIZE) + 1;
    for (let page = firstPage; page <= lastPage; page++) this.loadCustomerPage(page);
  }

  private loadCustomerPage(page: number): void {
    if (this.loadedCustomerPages.has(page)) return;
    // Claimed before the request: the scroller re-fires while one is in flight.
    this.loadedCustomerPages.add(page);
    this.customersApi
      .list({ page, limit: CUSTOMER_PAGE_SIZE })
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        if (!res) {
          this.loadedCustomerPages.delete(page);
          return;
        }
        const options = [...this.customerOptions()];
        this.fill(options, page, res.items);
        this.customerOptions.set(options);
      });
  }

  protected onCustomerFilter(term: string): void {
    this.customerSearch.next(term.trim());
  }

  /** Typing queries the server instead of the loaded slice.
   *
   *  Results are materialized in full, with **no placeholder rows** — `p-select`
   *  filters its options array client-side whenever a term is set, so the `…`
   *  slots would be dropped and the sparse tail (with its lazy loading) would go
   *  with them. Real rows survive that pass unchanged, since the server matched
   *  on the same names the local filter re-checks.
   *
   *  The trade: a term shows the first `CUSTOMER_PAGE_SIZE` matches and does not
   *  page further. Narrowing the term is the way to reach the rest — which is
   *  what someone typing a client's name is already doing. Clearing it restores
   *  the full lazily-paged roster. */
  private searchCustomers(term: string): void {
    if (!term) {
      this.seedCustomers();
      return;
    }
    this.customersApi
      .list({ page: 1, limit: CUSTOMER_PAGE_SIZE, search: term })
      .pipe(catchError(() => of(null)))
      .subscribe((res) => {
        if (!res) return;
        this.loadedCustomerPages.clear();
        this.customerOptions.set(
          res.items.map((customer) => ({ label: customer.name, value: customer.id })),
        );
      });
  }

  private fill(options: Option[], page: number, items: { id: string; name: string }[]): void {
    const offset = (page - 1) * CUSTOMER_PAGE_SIZE;
    items.forEach((customer, i) => {
      options[offset + i] = { label: customer.name, value: customer.id };
    });
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
    this.customerName.set(contract.customerName ?? null);
    this.lockedOrderId.set(contract.serviceOrderId ?? null);
    this.lockedOrderFolio.set(contract.serviceOrderFolio ?? null);
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
