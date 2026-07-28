import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
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
import { MessageService } from 'primeng/api';
import { LucideArrowLeft, LucidePlus, LucideTrash2 } from '@lucide/angular';
import { Store } from '@ngxs/store';
import { CreateServiceOrder } from '../../../../state/service-orders/service-orders.actions';
import { CustomersService } from '../../../services/http/customers.service';
import { ServicesCatalogService } from '../../../services/http/services-catalog.service';
import { UsersService } from '../../../services/http/users.service';
import { REPORT_TYPE_OPTIONS } from '../../../model/constants/service-order/report-type-options.const';
import { TAX_RATE_MULTIPLIERS } from '../../../model/constants/service-order/tax-rate-multipliers.const';
import { MoneyPipe } from '../../../pipes/money.pipe';
import { ServiceUomShortPipe } from '../../../pipes/service-uom.pipe';
import { PageHeader } from '../../../shared/components/page-header/page-header';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import type { Customer } from '../../../data/dtos/customer';
import type { Service } from '../../../data/dtos/service';
import type { ServiceOrderDetail } from '../../../data/dtos/service-order';
import type { AssignableUser } from '../../../data/dtos/user';

interface BuilderLineValue {
  serviceId: string;
  quantity: number;
  technicianId: string;
  reportType: string;
}

/** Client-side estimate of one line's money — mirrors the backend's
 *  integer-cents math (`order-money.ts`); the API resolves the authoritative
 *  totals from its own snapshots on create. */
const lineCents = (service: Service | undefined, quantity: number) => {
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
    RouterLink,
    ReactiveFormsModule,
    TableModule,
    SelectModule,
    InputTextModule,
    InputNumberModule,
    TextareaModule,
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

  /** Reference data, loaded once per visit. Every stream degrades to an empty
   *  list + toast on failure — an errored `toSignal` rethrows on every read,
   *  which aborts each change-detection pass and leaves the page looking
   *  frozen (the 2026-07-28 builder-freeze bug). The customer roster is NOT
   *  catalog-sized (1000+ rows live), so its select virtual-scrolls. */
  protected customers = toSignal(
    inject(CustomersService)
      .list({})
      .pipe(
        map((r) => r.items),
        catchError(this.refDataFallback<Customer>('los clientes')),
      ),
    { initialValue: [] },
  );
  protected services = toSignal(
    inject(ServicesCatalogService)
      .list({})
      .pipe(
        map((r) => r.services),
        catchError(this.refDataFallback<Service>('el catálogo de servicios')),
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

  protected readonly reportTypeOptions = REPORT_TYPE_OPTIONS;

  protected form = this.fb.nonNullable.group({
    customerId: ['', Validators.required],
    location: [''],
    comments: [''],
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
        reportType:
          REPORT_TYPE_OPTIONS.find((o) => o.value === line?.reportType)?.label ??
          line?.reportType ??
          '',
        amount: this.lineAmounts()[i] ?? '0.00',
      };
    });
  });

  protected customerName = computed(
    () => this.customers().find((c) => c.id === this.formValue().customerId)?.name ?? '',
  );

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

  private buildLine(): FormGroup {
    return this.fb.nonNullable.group({
      serviceId: ['', Validators.required],
      quantity: [1, [Validators.required, Validators.min(1), Validators.max(20)]],
      technicianId: ['', Validators.required],
      reportType: [REPORT_TYPE_OPTIONS[0].value, Validators.required],
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
          lines: (value.lines as BuilderLineValue[]).map((line) => ({
            serviceId: line.serviceId,
            quantity: line.quantity,
            technicianId: line.technicianId,
            reportType: line.reportType,
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
