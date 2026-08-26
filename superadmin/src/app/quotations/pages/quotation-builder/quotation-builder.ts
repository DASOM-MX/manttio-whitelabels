import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { MessageService } from 'primeng/api';
import { LucideListPlus, LucideTrash2 } from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { QuotationsState } from '../../../../state/quotations/quotations.state';
import {
  CreateQuotation,
  LoadQuotationDetail,
  UpdateQuotation,
} from '../../../../state/quotations/quotations.actions';
import { ServicesState } from '../../../../state/services/services.state';
import { LoadServiceOptions } from '../../../../state/services/services.actions';
import { QuotationTotalsService } from '../../../services/quotations/quotation-totals.service';
import { QuotationsService } from '../../../services/http/quotations.service';
import { QuotationStatus } from '../../../model/enums/quotation/quotation-status.enum';
import { SERVICE_TAX_RATE_LABELS } from '../../../model/constants/services/service-tax-rate-labels.const';
import { SERVICE_UOM_GROUPS } from '../../../model/constants/services/service-uom-groups.const';
import { ServiceTaxRate, ServiceUom } from '../../../data/dtos/service';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { ServiceTaxRateShortPipe } from '../../../pipes/service-tax-rate.pipe';
import { ServiceUomShortPipe } from '../../../pipes/service-uom.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import type { QuotationBuilderRow } from '../../../data/types/quotation/quotation-builder-row.type';
import type { QuotationLineForm } from '../../../data/types/quotation/quotation-line-form.type';
import type { QuotationLineRequest } from '../../../data/dtos/quotation/quotation-requests';
import { CustomerSelect } from '../../../shared/components/customer-select/customer-select';

/** `YYYY-MM-DD` from the picker's local calendar fields.
 *
 *  Deliberately **not** `toISOString().slice(0, 10)`: that converts to UTC
 *  first, so a date picked at local midnight lands on the previous day for any
 *  tenant east of Greenwich. `validUntil` is a calendar date — the day the
 *  quote stops being honoured — and it must not shift with the viewer. */
const toCalendarDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

/** Two-decimal money string from a currency input's number. `toFixed(2)` on a
 *  value the user typed with ≤2 decimals reproduces the typed literal — the
 *  nearest double sits far closer than the 0.005 that could flip the rounding. */
const toMoneyString = (value: number): string => value.toFixed(2);

/** Decimal-quantity string from the ≤3-decimals `p-inputnumber` value.
 *  `String()` prints the shortest round-trip form, which for a user-typed
 *  ≤3-decimal literal is that literal — no `toFixed` padding to mis-round. */
const toQuantityString = (value: number): string => String(value);

/** Dedicated builder page (20 §8) — client, lines from the catalog, expiry and
 *  terms. Saves as a `draft`; sending is a separate action on the view.
 *
 *  `/quotations/new` and `/quotations/:id/edit` are the same form. Editing is
 *  draft-only (the API 409s otherwise) and **replaces the line set wholesale**,
 *  re-resolving every snapshot from today's catalog — so re-saving a draft
 *  reprices it. The page says so rather than letting a price move silently. */
@Component({
  selector: 'app-quotation-builder',
  imports: [CustomerSelect, 
    RouterLink,
    ReactiveFormsModule,
    CheckboxModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    SelectModule,
    TextareaModule,
    MoneyPipe,
    ServiceTaxRateShortPipe,
    ServiceUomShortPipe,
    PageHeader,
    LucideListPlus,
    LucideTrash2,
  ],
  templateUrl: './quotation-builder.html',
})
export class QuotationBuilder implements HasPendingChanges {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private totalsService = inject(QuotationTotalsService);
  private quotationsService = inject(QuotationsService);
  private services = select(ServicesState.options);
  protected quotation = select(QuotationsState.selected);

  protected readonly editingId = this.route.snapshot.paramMap.get('id');
  /** Duplicar (PR-C, order-builder precedent): `?from=<id>` prefills from the
   *  source quote — a plain create afterwards, so the copy is born independent
   *  and catalog lines re-price server-side on save. */
  private readonly duplicateFromId = this.route.snapshot.queryParamMap.get('from');
  protected sourceFolio = signal<string | null>(null);
  protected submitting = signal(false);
  /** The draft was loaded and turned out not to be a draft. */
  protected notEditable = signal(false);

  protected form = this.fb.nonNullable.group({
    customerId: ['', Validators.required],
    // Nullable on purpose: "no date chosen" is a real state the required
    // validator has to be able to see.
    validUntil: new FormControl<Date | null>(null, Validators.required),
    comments: [''],
    lines: this.fb.array<QuotationLineForm>([]),
  });
  protected serviceOptions = computed(() =>
    this.services().map((s) => ({ label: s.name, value: s.id })),
  );

  protected readonly uomGroups = SERVICE_UOM_GROUPS;
  protected readonly taxRateOptions = (
    Object.entries(SERVICE_TAX_RATE_LABELS) as [ServiceTaxRate, string][]
  ).map(([value, label]) => ({ label, value }));

  /** Every edit, push and remove re-emits, so the derived rows and totals stay
   *  in step with what the user is typing. Mapped back through `getRawValue()`
   *  so the signal carries complete rows rather than `valueChanges`' partials. */
  private linesValue = toSignal(
    this.form.controls.lines.valueChanges.pipe(map(() => this.lines.getRawValue())),
    { initialValue: this.form.controls.lines.getRawValue() },
  );

  protected rows = computed<QuotationBuilderRow[]>(() => {
    const catalog = new Map(this.services().map((s) => [s.id, s]));
    return this.linesValue().map((line, index) => {
      const offCatalog = !!line.offCatalog;
      const service = !offCatalog && line.serviceId ? catalog.get(line.serviceId) : undefined;
      const quantity = line.quantity ?? 1;
      // Off-catalog rows price from their own fields (they ARE the snapshot);
      // catalog rows from the service they point at.
      const unitPrice = offCatalog
        ? toMoneyString(line.unitPrice ?? 0)
        : (service?.price ?? '0.00');
      const taxRate = offCatalog ? (line.taxRate ?? null) : (service?.taxRate ?? null);
      const priced = offCatalog ? line.unitPrice != null : !!service;
      const discountAmount = toMoneyString(line.discountAmount ?? 0);
      const measured = { unitPrice, quantity: toQuantityString(quantity) };
      return {
        index,
        offCatalog,
        serviceId: line.serviceId ?? '',
        quantity,
        serviceName: offCatalog ? (line.name ?? '') : (service?.name ?? ''),
        unitPrice,
        uom: offCatalog ? (line.uom ?? null) : (service?.uom ?? null),
        taxRate,
        discountAmount,
        subtotal: priced ? this.totalsService.lineSubtotal(measured) : '0.00',
        missing: !offCatalog && !!line.serviceId && !service,
        discountTooLarge:
          priced &&
          this.totalsService.discountExceedsLine({
            ...measured,
            taxRate: taxRate ?? ServiceTaxRate.Iva16,
            discountAmount,
          }),
      };
    });
  });

  /** Preview only — the saved figures are the server's, computed from the
   *  snapshots it resolves. Same arithmetic on both sides so they agree. */
  protected totals = computed(() =>
    this.totalsService.totals(
      this.rows()
        .filter((row) => row.taxRate !== null)
        .map((row) => ({
          unitPrice: row.unitPrice,
          quantity: toQuantityString(row.quantity),
          taxRate: row.taxRate!,
          discountAmount: row.discountAmount,
        })),
    ),
  );

  protected hasMissingService = computed(() => this.rows().some((row) => row.missing));

  protected canSave = computed(
    () =>
      !this.submitting() &&
      !this.hasMissingService() &&
      this.rows().length > 0 &&
      this.rows().every((row) => row.offCatalog || !!row.serviceId) &&
      !this.rows().some((row) => row.discountTooLarge),
  );

  constructor() {
    this.store.dispatch(new LoadServiceOptions());
    if (this.editingId) this.loadDraft(this.editingId);
    else if (this.duplicateFromId) this.loadFrom(this.duplicateFromId);
    else {
      this.addLine(true);
      this.prefillDefaultTerms();
    }
  }

  /** Tenant default terms (PR-C) — prefilled only into a blank new quote;
   *  programmatic setValue keeps the form pristine, so the guard stays quiet. */
  private prefillDefaultTerms(): void {
    this.quotationsService.getSettings().subscribe({
      next: ({ defaultComments }) => {
        if (defaultComments && !this.form.controls.comments.value) {
          this.form.controls.comments.setValue(defaultComments, { emitEvent: false });
        }
      },
      // Best-effort: a blank Términos is not worth an error toast.
      error: () => {},
    });
  }

  /** Duplicar prefill: client stays editable (a clone may target another
   *  client), a past validity comes back empty so a stale date can't ship by
   *  inertia, and the whole prefill stays pristine — scaffolding, not work. */
  private loadFrom(id: string): void {
    this.quotationsService.get(id).subscribe({
      next: (source) => {
        this.sourceFolio.set(source.folio);
        const today = new Date();
        const validUntil = new Date(`${source.validUntil}T00:00:00`);
        this.form.patchValue({
          customerId: source.customerId,
          validUntil: validUntil >= today ? validUntil : null,
          comments: source.comments ?? '',
        });
        this.lines.clear();
        for (const line of source.lines) {
          const offCatalog = !line.serviceId;
          this.lines.push(
            this.buildLineGroup({
              offCatalog,
              serviceId: line.serviceId ?? '',
              name: offCatalog ? line.serviceName : '',
              unitPrice: offCatalog ? Number(line.unitPrice) : null,
              uom: offCatalog ? line.uom : null,
              taxRate: offCatalog ? line.taxRate : null,
              quantity: Number(line.quantity),
              description: line.description ?? '',
              discountAmount: Number(line.discountAmount),
            }),
          );
        }
        this.form.markAsPristine();
      },
      error: (err) => {
        this.addLine(true);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo cargar la cotización a duplicar',
          detail: errorMessage(err, 'Se abrió una cotización en blanco.'),
        });
      },
    });
  }

  hasPendingChanges(): boolean {
    return this.form.dirty && !this.submitting();
  }

  protected get lines() {
    return this.form.controls.lines;
  }

  /** `initial` = the starter row on `/new` — scaffolding, not user work, so it
   *  alone must not arm the dirty-navigation guard. */
  protected addLine(initial = false): void {
    this.lines.push(this.buildLineGroup());
    // push/removeAt never set dirty on their own, and a structural edit is
    // still unsaved work the guard has to see.
    if (!initial) this.form.markAsDirty();
  }

  /** Swaps the required set with the row kind: a catalog row needs its
   *  `serviceId`; an off-catalog one needs the four fields that become its
   *  snapshot. Wired to the row's toggle. */
  protected onLineKindChange(index: number): void {
    const group = this.lines.at(index);
    if (group) this.applyLineKindValidators(group);
  }

  /** The % quick-entry: converts the typed percent **once** into the frozen
   *  amount control — the API only ever stores the amount (decided
   *  2026-07-29), so a later price change can never re-derive it. */
  protected applyDiscountPercent(index: number): void {
    const group = this.lines.at(index);
    const row = this.rows()[index];
    const percent = group?.controls.discountPercent.value;
    if (!group || !row || percent == null) return;
    const amount = this.totalsService.percentToAmount(
      { unitPrice: row.unitPrice, quantity: toQuantityString(row.quantity) },
      percent,
    );
    group.controls.discountAmount.setValue(Number(amount));
  }

  private buildLineGroup(line?: {
    offCatalog: boolean;
    serviceId: string;
    name: string;
    unitPrice: number | null;
    uom: ServiceUom | null;
    taxRate: ServiceTaxRate | null;
    quantity: number;
    description: string;
    discountAmount: number;
  }): QuotationLineForm {
    const group: QuotationLineForm = this.fb.nonNullable.group({
      offCatalog: [line?.offCatalog ?? false],
      serviceId: [line?.serviceId ?? ''],
      name: [line?.name ?? ''],
      unitPrice: new FormControl<number | null>(line?.unitPrice ?? null),
      uom: new FormControl<ServiceUom | null>(line?.uom ?? null),
      taxRate: new FormControl<ServiceTaxRate | null>(line?.taxRate ?? null),
      quantity: [line?.quantity ?? 1, [Validators.required, Validators.min(0.001)]],
      description: [line?.description ?? ''],
      discountAmount: [line?.discountAmount ?? 0, Validators.min(0)],
      // Builder-local quick-entry — converted to `discountAmount` on apply,
      // never part of the payload.
      discountPercent: new FormControl<number | null>(null),
    });
    this.applyLineKindValidators(group);
    return group;
  }

  private applyLineKindValidators(group: QuotationLineForm): void {
    const off = group.controls.offCatalog.value;
    const { serviceId, name, unitPrice, uom, taxRate } = group.controls;
    serviceId.setValidators(off ? [] : [Validators.required]);
    name.setValidators(off ? [Validators.required] : []);
    unitPrice.setValidators(off ? [Validators.required, Validators.min(0)] : []);
    uom.setValidators(off ? [Validators.required] : []);
    taxRate.setValidators(off ? [Validators.required] : []);
    for (const control of [serviceId, name, unitPrice, uom, taxRate]) {
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  /** The API demands at least one line, so the last row can't be removed. */
  protected removeLine(index: number): void {
    if (this.lines.length <= 1) return;
    this.lines.removeAt(index);
    this.form.markAsDirty();
  }

  protected save(): void {
    if (this.form.invalid || !this.canSave()) return;
    const raw = this.form.getRawValue();
    const validUntil = raw.validUntil;
    if (!validUntil) return;

    const lines: QuotationLineRequest[] = raw.lines.map((line) => {
      const common = {
        quantity: toQuantityString(line.quantity),
        ...(line.description?.trim() ? { description: line.description.trim() } : {}),
        ...(line.discountAmount > 0 ? { discountAmount: toMoneyString(line.discountAmount) } : {}),
      };
      // The non-null assertions restate the swapped validators' contract
      // (`applyLineKindValidators`), they don't extend it.
      return line.offCatalog
        ? {
            name: line.name.trim(),
            unitPrice: toMoneyString(line.unitPrice ?? 0),
            uom: line.uom!,
            taxRate: line.taxRate!,
            ...common,
          }
        : { serviceId: line.serviceId, ...common };
    });
    const payload = {
      validUntil: toCalendarDate(validUntil),
      comments: raw.comments.trim(),
      lines,
    };

    this.submitting.set(true);
    const request = this.editingId
      ? this.store.dispatch(new UpdateQuotation(this.editingId, payload))
      : this.store.dispatch(new CreateQuotation({ ...payload, customerId: raw.customerId }));

    request.subscribe({
      next: () => {
        this.submitting.set(false);
        // Saved work isn't pending work — without this the guard would prompt
        // on the success navigation below.
        this.form.markAsPristine();
        this.messages.add({
          severity: 'success',
          summary: this.editingId ? 'Cotización actualizada' : 'Cotización creada',
        });
        this.router.navigate(['/quotations', this.editingId ?? this.quotation()?.id]);
      },
      error: (err) => {
        this.submitting.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo guardar',
          detail: errorMessage(err, 'Revisa las partidas e inténtalo de nuevo.'),
        });
      },
    });
  }

  private loadDraft(id: string): void {
    this.store.dispatch(new LoadQuotationDetail(id)).subscribe({
      next: () => {
        const quotation = this.quotation();
        if (!quotation) return;
        if (quotation.status !== QuotationStatus.Draft) {
          this.notEditable.set(true);
          return;
        }
        this.form.patchValue({
          customerId: quotation.customerId,
          validUntil: new Date(`${quotation.validUntil}T00:00:00`),
          comments: quotation.comments ?? '',
        });
        // The client can't move once the quote exists — its folio, contacts and
        // every event are already bound to it.
        this.form.controls.customerId.disable({ emitEvent: false });
        this.lines.clear();
        for (const line of quotation.lines) {
          const offCatalog = !line.serviceId;
          this.lines.push(
            this.buildLineGroup({
              offCatalog,
              serviceId: line.serviceId ?? '',
              name: offCatalog ? line.serviceName : '',
              unitPrice: offCatalog ? Number(line.unitPrice) : null,
              uom: offCatalog ? line.uom : null,
              taxRate: offCatalog ? line.taxRate : null,
              quantity: Number(line.quantity),
              description: line.description ?? '',
              discountAmount: Number(line.discountAmount),
            }),
          );
        }
      },
      error: () => this.notEditable.set(true),
    });
  }
}
