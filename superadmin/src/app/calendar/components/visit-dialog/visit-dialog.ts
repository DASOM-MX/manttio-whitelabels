import { Component, computed, inject, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, concat, of, type Observable } from 'rxjs';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Store, select } from '@ngxs/store';
import { AssignVisit, CorrectVisit, CreateVisit, RespondVisit } from '../../../../state/visits/visits.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { hasRole } from '../../../guards/has-role.guard';
import { ServiceOrdersService } from '../../../services/http/service-orders.service';
import { EquipmentService } from '../../../services/http/equipment.service';
import { UsersService } from '../../../services/http/users.service';
import { ServiceOrderStatus } from '../../../model/enums/service-order/service-order-status.enum';
import { VisitStatus } from '../../../model/enums/visit/visit-status.enum';
import {
  VisitCloseReasonLabelPipe,
  VisitStatusLabelPipe,
  VisitStatusSeverityPipe,
} from '../../../pipes/visit.pipe';
import { errorMessage } from '../../../data/utils';
import type { AssignableUser } from '../../../data/dtos/user';
import type { CorrectVisitRequest, Visit, VisitOrderContext } from '../../../data/dtos/visit';

/** One entry of the searchable order select — the open orders, labeled
 *  `folio — cliente`, carrying the customer the visit will derive. */
interface OrderOption {
  value: string;
  label: string;
  customerId: string;
}

interface EquipmentOption {
  value: string;
  label: string;
}

/** The shape-3 visit dialog (12 §4). Create: the REQUIRED service-order select
 *  (client derives from the order; the order view opens it locked), optional
 *  technician (omitted = backlog), the client's units, date + optional time
 *  range, title, notes. On an **open** visit it becomes the correction form
 *  (scheduling fields + reassignment — the only mutations the immutable-record
 *  model permits) plus the staff actions: Responder (served) and Cerrar (hands
 *  off to the categorized-close dialog). Once terminal it is read-only — the
 *  full history lives on the parent order's timeline, not here. */
@Component({
  selector: 'app-visit-dialog',
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    DialogModule,
    DatePickerModule,
    InputTextModule,
    SelectModule,
    MultiSelectModule,
    TagModule,
    TextareaModule,
    VisitCloseReasonLabelPipe,
    VisitStatusLabelPipe,
    VisitStatusSeverityPipe,
  ],
  templateUrl: './visit-dialog.html',
})
export class VisitDialog {
  /** A mutation landed — the calendar reloads its week. */
  readonly changed = output<void>();
  /** Cerrar chosen — the parent opens the categorized-close dialog. */
  readonly closeRequested = output<Visit>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);
  private serviceOrders = inject(ServiceOrdersService);
  private equipmentApi = inject(EquipmentService);

  private me = select(AuthState.me);
  protected isStaff = computed(() => hasRole(this.me(), ['owner', 'admin', 'office']));

  protected dialogOpen = signal(false);
  protected target = signal<Visit | null>(null);
  protected lockedOrder = signal<VisitOrderContext | null>(null);
  protected submitting = signal(false);

  protected orderOptions = signal<OrderOption[]>([]);
  protected ordersLoading = signal(false);
  protected equipmentOptions = signal<EquipmentOption[]>([]);

  protected form = this.fb.nonNullable.group({
    orderId: ['', Validators.required],
    technicianId: [''],
    equipmentIds: [[] as string[]],
    fecha: this.fb.control<Date | null>(null, Validators.required),
    horaInicio: this.fb.control<Date | null>(null, Validators.required),
    horaFin: this.fb.control<Date | null>(null),
    title: [''],
    notes: [''],
  });

  protected technicians = toSignal(
    inject(UsersService)
      .listAssignable()
      .pipe(catchError(() => of([] as AssignableUser[]))),
    { initialValue: [] as AssignableUser[] },
  );

  protected technicianOptions = computed(() => [
    { label: 'Sin asignar', value: '' },
    ...this.technicians().map((user) => ({ label: user.fullName, value: user.id })),
  ]);

  private formStatus = toSignal(this.form.statusChanges, { initialValue: this.form.status });
  protected canConfirm = computed(() => this.formStatus() === 'VALID' && !this.submitting());

  protected isCreate = computed(() => this.target() === null);
  /** Correction window: staff, and the visit still open (12 §1). */
  protected isEditable = computed(() => {
    const visit = this.target();
    return this.isStaff() && (visit === null || visit.status === VisitStatus.Scheduled);
  });
  protected isClosed = computed(() => this.target()?.status === VisitStatus.Closed);

  /** Read-only equipment names for a loaded visit. */
  protected equipmentNames = computed(() =>
    (this.target()?.equipment ?? [])
      .map((link) => link.name || 'Equipo')
      .join(', '),
  );

  constructor() {
    // The client — and therefore the offerable units — derives from the order.
    this.form.controls.orderId.valueChanges.pipe(takeUntilDestroyed()).subscribe((orderId) => {
      const customerId =
        this.lockedOrder()?.customerId ??
        this.orderOptions().find((option) => option.value === orderId)?.customerId;
      this.form.controls.equipmentIds.setValue([]);
      this.loadEquipment(customerId);
    });
  }

  /** New visit; `order` pins the selection (order view's "Programar visita"). */
  openCreate(order?: VisitOrderContext): void {
    this.target.set(null);
    this.lockedOrder.set(order ?? null);
    this.equipmentOptions.set([]);
    this.form.reset({
      orderId: order?.id ?? '',
      technicianId: '',
      equipmentIds: [],
      fecha: null,
      horaInicio: defaultStartTime(),
      horaFin: null,
      title: '',
      notes: '',
    });
    // The reset above already re-derived the equipment via `orderId`'s
    // valueChanges; a locked order needs no order list at all.
    if (!order) this.loadOpenOrders();
    this.submitting.set(false);
    this.dialogOpen.set(true);
  }

  /** Existing visit — correction form while open, read-only once terminal. */
  openVisit(visit: Visit): void {
    this.target.set(visit);
    this.lockedOrder.set(null);
    this.equipmentOptions.set([]);
    const start = new Date(visit.scheduledStart);
    this.form.reset({
      orderId: visit.serviceOrderId ?? '',
      technicianId: visit.technicianId ?? '',
      equipmentIds: visit.equipment.map((link) => link.id),
      fecha: start,
      horaInicio: start,
      horaFin: visit.scheduledEnd ? new Date(visit.scheduledEnd) : null,
      title: visit.title ?? '',
      notes: visit.notes ?? '',
    });
    this.submitting.set(false);
    this.dialogOpen.set(true);
  }

  protected close(): void {
    if (this.submitting()) return;
    this.dialogOpen.set(false);
  }

  protected confirm(): void {
    if (!this.canConfirm()) return;
    if (this.isCreate()) this.create();
    else this.saveCorrections();
  }

  /** Responder — the visit was served (12 §1); the report links later from the
   *  field side. Staff shortcut for marking it manually. */
  protected respond(): void {
    const visit = this.target();
    if (!visit || this.submitting()) return;
    this.confirmation.confirm({
      header: 'Marcar como realizada',
      message: 'La visita queda como realizada y ya no podrá editarse. El reporte se vincula desde el reporte mismo.',
      acceptLabel: 'Marcar realizada',
      rejectLabel: 'Volver',
      acceptButtonStyleClass: 'btn-primary',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => {
        this.submitting.set(true);
        this.store.dispatch(new RespondVisit(visit.id)).subscribe({
          next: () => {
            this.submitting.set(false);
            this.dialogOpen.set(false);
            this.messages.add({ severity: 'success', summary: 'Visita realizada' });
            this.changed.emit();
          },
          error: (err) => {
            this.submitting.set(false);
            this.toastError('No se pudo marcar', err);
          },
        });
      },
    });
  }

  /** Cerrar — categorized, in its own dialog; this one steps aside. */
  protected requestClose(): void {
    const visit = this.target();
    if (!visit || this.submitting()) return;
    this.dialogOpen.set(false);
    this.closeRequested.emit(visit);
  }

  private create(): void {
    const raw = this.form.getRawValue();
    const order = this.lockedOrder() ?? null;
    const customerId =
      order?.customerId ??
      this.orderOptions().find((option) => option.value === raw.orderId)?.customerId;
    if (!customerId || !raw.fecha || !raw.horaInicio) return;
    this.submitting.set(true);
    this.store
      .dispatch(
        new CreateVisit({
          customerId,
          serviceOrderId: raw.orderId,
          technicianId: raw.technicianId || undefined,
          equipmentIds: raw.equipmentIds.length ? raw.equipmentIds : undefined,
          scheduledStart: atTime(raw.fecha, raw.horaInicio).toISOString(),
          scheduledEnd: raw.horaFin ? atTime(raw.fecha, raw.horaFin).toISOString() : undefined,
          title: raw.title.trim() || undefined,
          notes: raw.notes.trim() || undefined,
        }),
      )
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.dialogOpen.set(false);
          this.messages.add({ severity: 'success', summary: 'Visita programada' });
          this.changed.emit();
        },
        error: (err) => {
          this.submitting.set(false);
          this.toastError('No se pudo programar', err);
        },
      });
  }

  /** Correction + reassignment are separate endpoints (each audits its own
   *  order-timeline event); one Guardar dispatches whichever changed. */
  private saveCorrections(): void {
    const visit = this.target();
    if (!visit) return;
    const raw = this.form.getRawValue();
    if (!raw.fecha || !raw.horaInicio) return;

    const patch: CorrectVisitRequest = {};
    const start = atTime(raw.fecha, raw.horaInicio).toISOString();
    if (start !== visit.scheduledStart) patch.scheduledStart = start;
    const end = raw.horaFin ? atTime(raw.fecha, raw.horaFin).toISOString() : null;
    if ((end ?? undefined) !== visit.scheduledEnd) patch.scheduledEnd = end;
    const title = raw.title.trim() || null;
    if ((title ?? undefined) !== visit.title) patch.title = title;
    const notes = raw.notes.trim() || null;
    if ((notes ?? undefined) !== visit.notes) patch.notes = notes;

    const technicianId = raw.technicianId || null;
    const techChanged = (technicianId ?? undefined) !== visit.technicianId;

    const ops: Observable<unknown>[] = [];
    if (Object.keys(patch).length > 0) ops.push(this.store.dispatch(new CorrectVisit(visit.id, patch)));
    if (techChanged) ops.push(this.store.dispatch(new AssignVisit(visit.id, technicianId)));
    if (ops.length === 0) {
      this.dialogOpen.set(false);
      return;
    }
    this.submitting.set(true);
    concat(...ops).subscribe({
      complete: () => {
        this.submitting.set(false);
        this.dialogOpen.set(false);
        this.messages.add({ severity: 'success', summary: 'Visita actualizada' });
        this.changed.emit();
      },
      error: (err) => {
        this.submitting.set(false);
        this.toastError('No se pudo guardar', err);
      },
    });
  }

  private loadOpenOrders(): void {
    this.ordersLoading.set(true);
    this.serviceOrders.list({ status: ServiceOrderStatus.Open, limit: 100 }).subscribe({
      next: ({ items }) => {
        this.ordersLoading.set(false);
        this.orderOptions.set(
          items.map((order) => ({
            value: order.id,
            label: `${order.folio} — ${order.customerName}`,
            customerId: order.customerId,
          })),
        );
      },
      error: (err) => {
        this.ordersLoading.set(false);
        this.toastError('No se pudieron cargar las órdenes', err);
      },
    });
  }

  private loadEquipment(customerId: string | undefined): void {
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

  private toastError(summary: string, err: unknown): void {
    this.messages.add({ severity: 'error', summary, detail: errorMessage(err, 'Inténtalo de nuevo.') });
  }
}

/** Local-field date+time composition — never millisecond math. */
const atTime = (date: Date, time: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes());

/** The default visit start — mid-morning, the SMB "morning-ish" slot. */
const defaultStartTime = (): Date => new Date(1970, 0, 1, 9, 0);
