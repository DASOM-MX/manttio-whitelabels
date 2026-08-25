import { Component, computed, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type FormGroup,
} from '@angular/forms';
import { catchError, map, of, type Observable } from 'rxjs';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TextareaModule } from 'primeng/textarea';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService } from 'primeng/api';
import { LucideArrowLeft, LucidePlus, LucideTrash2 } from '@lucide/angular';
import { Store } from '@ngxs/store';
import { CreateServiceOrder } from '../../../../state/service-orders/service-orders.actions';
import { CustomersService } from '../../../services/http/customers.service';
import { ServicesCatalogService } from '../../../services/http/services-catalog.service';
import { ServiceOrdersService } from '../../../services/http/service-orders.service';
import { UsersService } from '../../../services/http/users.service';
import { ReportTemplatesService } from '../../../services/http/report-templates.service';
import { TemplateStatus, type ReportTemplate } from '../../../data/dtos/report-template';
import { SERVICE_ORDER_PRIORITY_LABELS } from '../../../model/constants/service-order/service-order-priority-labels.const';
import { TAX_RATE_MULTIPLIERS } from '../../../model/constants/service-order/tax-rate-multipliers.const';
import { ServiceOrderPriority } from '../../../model/enums/service-order/service-order-priority.enum';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { ServiceUomShortPipe } from '../../../pipes/service-uom.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { errorMessage, toCalendarDate } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import type { CustomerOption } from '../../../data/dtos/customer';
import type { ServiceOption } from '../../../data/dtos/service';
import type { ServiceOrderDetail } from '../../../data/dtos/service-order';
import type { AssignableUser } from '../../../data/dtos/user';

interface BuilderLineValue {
  serviceId: string;
  quantity: number;
  technicianId: string;
  templateId: string;
}

/** Client-side estimate of one line's money — mirrors the backend's
 *  integer-cents math (`order-money.ts`); the API resolves the authoritative
 *  totals from its own snapshots on create. */
const lineCents = (service: ServiceOption | undefined, quantity: number) => {
  if (!service) return { subtotal: 0, tax: 0 };
  const subtotal = Math.round(Number(service.price) * 100) * (quantity || 0);
  return { subtotal, tax: Math.round(subtotal * TAX_RATE_MULTIPLIERS[service.taxRate]) };
};

const fromCents = (cents: number): string => (cents / 100).toFixed(2);

/** The order builder (19 §5) — a dedicated page, not a dialog (decided
 *  2026-07-23: the multi-line builder is too heavy for the shape-3 idiom).
 *  Client + location + comments, then the lines builder (service, quantity,
 *  technician, report type per row — the explosion inputs of 19 §2), a running
 *  total, and a review step before the create transaction. */
@Component({
  selector: 'app-service-order-builder',
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
    DatePickerModule,
    MoneyPipe,
    ServiceUomShortPipe,
    PageHeader,
    LucideArrowLeft,
    LucidePlus,
    LucideTrash2,
  ],
  templateUrl: './service-order-builder.html',
})
export class ServiceOrderBuilder implements HasPendingChanges {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private router = inject(Router);
  private messages = inject(MessageService);
  private templatesHttp = inject(ReportTemplatesService);

  /** Reference data, loaded once per visit. Every stream degrades to an empty
   *  list + toast on failure — an errored `toSignal` rethrows on every read,
   *  which aborts each change-detection pass and leaves the page looking
   *  frozen (the 2026-07-28 builder-freeze bug). The customer roster is NOT
   *  catalog-sized (1000+ rows live), so its select virtual-scrolls — and it
   *  comes from the dedicated roster routes (21 §3), never the list reads:
   *  `list({})` here used to mean "every row" and would silently become
   *  "the first 10" the moment CP-4 lands. */
  protected customers = toSignal(
    inject(CustomersService)
      .listOptions()
      .pipe(
        map((r) => r.items),
        catchError(this.refDataFallback<CustomerOption>('los clientes')),
      ),
    { initialValue: [] },
  );
  protected services = toSignal(
    inject(ServicesCatalogService)
      .listOptions()
      .pipe(
        map((r) => r.items),
        catchError(this.refDataFallback<ServiceOption>('el catálogo de servicios')),
      ),
    { initialValue: [] },
  );
  /** Anyone on the roster can be assigned (the backend takes the same
   *  trusted-field posture as report creation — small shops send admins to
   *  site), so the select lists everyone, technicians included. */
  protected technicians = toSignal(
    inject(UsersService)
      .listAssignable()
      .pipe(catchError(this.refDataFallback<AssignableUser>('los técnicos'))),
    { initialValue: [] },
  );

  /** The tenant's own active report templates — what each line's exploded report
   *  will be filled against (03 §3.5). Only `active` templates may be assigned;
   *  the backend re-validates that at creation time and 400s on anything else.
   *  Replaces the old hardcoded minisplit/chiller/uma list. */
  protected reportTemplates = toSignal(this.activeTemplates$(), { initialValue: [] });

  protected templateOptions = computed(() =>
    this.reportTemplates().map((t) => ({ label: t.name, value: t.id })),
  );

  private templateNamesById = computed(
    () => new Map(this.reportTemplates().map((t) => [t.id, t.name])),
  );

  /** A tenant with no active template cannot open an order: every line must name
   *  the template its report will use. Surfaced instead of failing on submit. */
  protected hasNoActiveTemplates = computed(() => this.reportTemplates().length === 0);

  protected priorityOptions = (
    Object.entries(SERVICE_ORDER_PRIORITY_LABELS) as [ServiceOrderPriority, string][]
  ).map(([value, label]) => ({ label, value }));

  protected form = this.fb.nonNullable.group({
    customerId: ['', Validators.required],
    location: [''],
    comments: [''],
    priority: [ServiceOrderPriority.Normal],
    promisedDate: this.fb.control<Date | null>(null),
    lines: this.fb.nonNullable.array([this.buildLine()]),
  });

  protected get lines() {
    return this.form.controls.lines;
  }

  /** Review step (19 §5): the form freezes behind a read-only summary until
   *  confirmed or edited again. */
  protected reviewing = signal(false);
  protected submitting = signal(false);
  private created = false;

  /** Duplicar (CP-2b): `?from=<id>` prefills from the source order — a plain
   *  http read, never the store. Held here until the catalog arrives, because
   *  the prefill must know which source lines still exist to keep. */
  private sourceOrder = signal<ServiceOrderDetail | null>(null);
  private ordersHttp = inject(ServiceOrdersService);

  constructor() {
    const from = inject(ActivatedRoute).snapshot.queryParamMap.get('from');
    if (from) {
      this.ordersHttp.get(from).subscribe({
        next: ({ order }) => this.sourceOrder.set(order),
        error: (err) =>
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo cargar la orden a duplicar',
            detail: errorMessage(err, 'Puedes crear la orden desde cero.'),
          }),
      });
    }
    effect(() => {
      const source = this.sourceOrder();
      const catalog = this.servicesById();
      if (!source || catalog.size === 0) return;
      this.sourceOrder.set(null);
      this.prefillFrom(source, catalog);
    });
  }

  /** Client + location + comments + lines (service, quantity). Technician and
   *  report type are deliberately NOT copied — they are explosion inputs owned
   *  by the exploded reports (19 §1), and the source order's assignments are
   *  stale by design; prices resolve fresh from today's catalog. Neither are
   *  priority/promise — a new job negotiates its own. */
  private prefillFrom(source: ServiceOrderDetail, catalog: Map<string, ServiceOption>): void {
    this.form.patchValue({
      customerId: source.customerId,
      location: source.location ?? '',
      comments: source.comments ?? '',
    });

    const kept = source.lines.filter((line) => catalog.has(line.serviceId));
    this.lines.clear();
    for (const line of kept) {
      const control = this.buildLine();
      control.patchValue({ serviceId: line.serviceId, quantity: line.quantity });
      this.lines.push(control);
    }
    if (kept.length === 0) this.lines.push(this.buildLine());

    const skipped = source.lines.length - kept.length;
    if (skipped > 0) {
      this.messages.add({
        severity: 'warn',
        summary: 'Servicios omitidos',
        detail:
          skipped === 1
            ? '1 servicio de la orden original ya no está en el catálogo.'
            : `${skipped} servicios de la orden original ya no están en el catálogo.`,
      });
    }
  }

  private formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  private formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });

  private servicesById = computed(() => new Map(this.services().map((s) => [s.id, s])));

  /** One line per service (19 §1) — the API rejects duplicates outright, so
   *  the builder disables review and says why instead of round-tripping. */
  protected hasDuplicateServices = computed(() => {
    const ids = (this.formValue().lines ?? [])
      .map((l) => l?.serviceId)
      .filter((id): id is string => !!id);
    return new Set(ids).size !== ids.length;
  });

  /** Running money per line + order totals, recomputed on every form change. */
  protected lineAmounts = computed(() => {
    const byId = this.servicesById();
    return (this.formValue().lines ?? []).map((line) => {
      const { subtotal, tax } = lineCents(byId.get(line?.serviceId ?? ''), line?.quantity ?? 0);
      return fromCents(subtotal + tax);
    });
  });

  protected totals = computed(() => {
    const byId = this.servicesById();
    const summed = (this.formValue().lines ?? []).reduce(
      (acc, line) => {
        const { subtotal, tax } = lineCents(byId.get(line?.serviceId ?? ''), line?.quantity ?? 0);
        return { subtotal: acc.subtotal + subtotal, tax: acc.tax + tax };
      },
      { subtotal: 0, tax: 0 },
    );
    return {
      subtotal: fromCents(summed.subtotal),
      tax: fromCents(summed.tax),
      total: fromCents(summed.subtotal + summed.tax),
    };
  });

  protected totalUnits = computed(() =>
    (this.formValue().lines ?? []).reduce((sum, line) => sum + (line?.quantity ?? 0), 0),
  );

  protected canReview = computed(
    () => this.formStatus() === 'VALID' && !this.hasDuplicateServices() && !this.submitting(),
  );

  /** The review summary, resolved to display names once — the template reads
   *  plain rows, no lookups. */
  protected reviewRows = computed(() => {
    const byId = this.servicesById();
    const technicians = new Map(this.technicians().map((u) => [u.id, u]));
    return (this.formValue().lines ?? []).map((line, i) => {
      const service = byId.get(line?.serviceId ?? '');
      const tech = technicians.get(line?.technicianId ?? '');
      return {
        serviceName: service?.name ?? '',
        uom: service?.uom,
        quantity: line?.quantity ?? 0,
        technicianName: tech?.fullName ?? '',
        templateName: this.templateNamesById().get(line?.templateId ?? '') ?? '',
        amount: this.lineAmounts()[i] ?? '0.00',
      };
    });
  });

  protected customerName = computed(
    () => this.customers().find((c) => c.id === this.formValue().customerId)?.name ?? '',
  );

  protected priorityLabel = computed(
    () => SERVICE_ORDER_PRIORITY_LABELS[this.formValue().priority ?? ServiceOrderPriority.Normal],
  );

  protected promisedDateValue = computed(() => this.formValue().promisedDate ?? null);

  hasPendingChanges(): boolean {
    return this.form.dirty && !this.created;
  }

  /** Empty-list fallback for a failed reference fetch: toast + degrade. The
   *  error must never reach `toSignal` — an errored signal rethrows on every
   *  read, which kills each change-detection pass and freezes the page. */
  private refDataFallback<T>(what: string): (err: unknown) => Observable<T[]> {
    return (err) => {
      this.messages.add({
        severity: 'error',
        summary: `No se pudieron cargar ${what}`,
        detail: errorMessage(err, 'Recarga la página para reintentarlo.'),
      });
      return of([]);
    };
  }

  /** The active-template fetch on its own, independent of how it is consumed:
   *  the builder wraps it in `toSignal`, but a dialog or resolver can subscribe
   *  to the same stream without inheriting that choice. */
  private activeTemplates$(): Observable<ReportTemplate[]> {
    return this.templatesHttp.list({ status: TemplateStatus.Active, limit: 100 }).pipe(
      map((r) => r.items),
      catchError(this.refDataFallback<ReportTemplate>('las plantillas de reporte')),
    );
  }

  private buildLine(): FormGroup {
    return this.fb.nonNullable.group({
      serviceId: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1), Validators.max(20)]],
      technicianId: ['', Validators.required],
      templateId: ['', Validators.required],
    });
  }

  protected addLine(): void {
    this.lines.push(this.buildLine());
  }

  protected removeLine(index: number): void {
    if (this.lines.length > 1) this.lines.removeAt(index);
  }

  protected review(): void {
    if (!this.canReview()) return;
    this.reviewing.set(true);
  }

  protected backToEdit(): void {
    this.reviewing.set(false);
  }

  protected submit(): void {
    if (this.submitting()) return;
    this.submitting.set(true);
    const value = this.form.getRawValue();
    this.store
      .dispatch(
        new CreateServiceOrder({
          customerId: value.customerId,
          location: value.location || undefined,
          comments: value.comments || undefined,
          priority: value.priority,
          promisedDate: value.promisedDate ? toCalendarDate(value.promisedDate) : undefined,
          lines: (value.lines as BuilderLineValue[]).map((line) => ({
            serviceId: line.serviceId,
            quantity: line.quantity,
            technicianId: line.technicianId,
            templateId: line.templateId,
          })),
        }),
      )
      .subscribe({
        next: () => {
          this.created = true;
          const order = this.store.selectSnapshot(
            (s: { serviceOrders: { selected: ServiceOrderDetail | null } }) =>
              s.serviceOrders.selected,
          );
          this.messages.add({
            severity: 'success',
            summary: 'Orden creada',
            detail: order ? `Folio ${order.folio}` : undefined,
          });
          void this.router.navigate(['/service-orders', order?.id]);
        },
        error: (err) => {
          this.submitting.set(false);
          this.reviewing.set(false);
          this.messages.add({
            severity: 'error',
            summary: 'No se pudo crear la orden',
            detail: errorMessage(err, 'Revisa los datos e inténtalo de nuevo.'),
          });
        },
      });
  }
}
