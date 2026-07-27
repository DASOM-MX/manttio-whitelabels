import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { map } from 'rxjs';
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
import { CustomersState } from '../../../../state/customers/customers.state';
import { LoadCustomers } from '../../../../state/customers/customers.actions';
import { ServicesState } from '../../../../state/services/services.state';
import { LoadServices } from '../../../../state/services/services.actions';
import { QuotationTotalsService } from '../../../services/quotations/quotation-totals.service';
import { QuotationStatus } from '../../../model/enums/quotation/quotation-status.enum';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { ServiceTaxRateShortPipe } from '../../../pipes/service-tax-rate.pipe';
import { ServiceUomShortPipe } from '../../../pipes/service-uom.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { errorMessage } from '../../../data/utils';
import type { QuotationBuilderRow } from '../../../data/types/quotation/quotation-builder-row.type';
import type { QuotationLineForm } from '../../../data/types/quotation/quotation-line-form.type';
import type { QuotationLineRequest } from '../../../data/dtos/quotation/quotation-requests';

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

/** Dedicated builder page (20 §8) — client, lines from the catalog, expiry and
 *  terms. Saves as a `draft`; sending is a separate action on the view.
 *
 *  `/quotations/new` and `/quotations/:id/edit` are the same form. Editing is
 *  draft-only (the API 409s otherwise) and **replaces the line set wholesale**,
 *  re-resolving every snapshot from today's catalog — so re-saving a draft
 *  reprices it. The page says so rather than letting a price move silently. */
@Component({
  selector: 'app-quotation-builder',
  imports: [
    RouterLink,
    ReactiveFormsModule,
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
export class QuotationBuilder {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private totalsService = inject(QuotationTotalsService);

  private customers = select(CustomersState.items);
  private services = select(ServicesState.items);
  protected quotation = select(QuotationsState.selected);

  protected readonly editingId = this.route.snapshot.paramMap.get('id');
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

  protected customerOptions = computed(() =>
    this.customers().map((c) => ({ label: c.name, value: c.id })),
  );

  protected serviceOptions = computed(() =>
    this.services().map((s) => ({ label: s.name, value: s.id })),
  );

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
      const service = line.serviceId ? catalog.get(line.serviceId) : undefined;
      const quantity = line.quantity ?? 1;
      return {
        index,
        serviceId: line.serviceId ?? '',
        quantity,
        serviceName: service?.name ?? '',
        unitPrice: service?.price ?? '0.00',
        uom: service?.uom ?? null,
        taxRate: service?.taxRate ?? null,
        subtotal: service
          ? this.totalsService.lineSubtotal({
              unitPrice: service.price,
              quantity,
              taxRate: service.taxRate,
            })
          : '0.00',
        missing: !!line.serviceId && !service,
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
          quantity: row.quantity,
          taxRate: row.taxRate!,
        })),
    ),
  );

  protected hasMissingService = computed(() => this.rows().some((row) => row.missing));

  protected canSave = computed(
    () =>
      !this.submitting() &&
      !this.hasMissingService() &&
      this.rows().length > 0 &&
      this.rows().every((row) => !!row.serviceId),
  );

  constructor() {
    this.store.dispatch(new LoadCustomers({ page: 1, limit: 100 }));
    this.store.dispatch(new LoadServices({}));
    if (this.editingId) this.loadDraft(this.editingId);
    else this.addLine();
  }

  protected get lines() {
    return this.form.controls.lines;
  }

  protected addLine(): void {
    this.lines.push(
      this.fb.nonNullable.group({
        serviceId: ['', Validators.required],
        quantity: [1, [Validators.required, Validators.min(1)]],
        description: [''],
      }),
    );
  }

  /** The API demands at least one line, so the last row can't be removed. */
  protected removeLine(index: number): void {
    if (this.lines.length <= 1) return;
    this.lines.removeAt(index);
  }

  protected save(): void {
    if (this.form.invalid || !this.canSave()) return;
    const raw = this.form.getRawValue();
    const validUntil = raw.validUntil;
    if (!validUntil) return;

    const lines: QuotationLineRequest[] = raw.lines.map((line) => ({
      serviceId: line.serviceId,
      quantity: line.quantity,
      ...(line.description?.trim() ? { description: line.description.trim() } : {}),
    }));
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
          this.lines.push(
            this.fb.nonNullable.group({
              serviceId: [line.serviceId, Validators.required],
              quantity: [line.quantity, [Validators.required, Validators.min(1)]],
              description: [line.description ?? ''],
            }),
          );
        }
      },
      error: () => this.notEditable.set(true),
    });
  }
}
