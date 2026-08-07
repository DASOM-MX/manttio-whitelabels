import { Component, computed, inject, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, concat, defer, of, type Observable } from 'rxjs';
import { DialogModule } from 'primeng/dialog';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ConfirmationService, MessageService } from 'primeng/api';
import { Actions, Store, ofActionDispatched, select } from '@ngxs/store';
import {
  AssignVisit,
  CorrectVisit,
  CreateVisit,
  RespondVisit,
  VisitEventReceived,
} from '../../../../state/visits/visits.actions';
import { AuthState } from '../../../../state/auth/auth.state';
import { hasRole } from '../../../guards/has-role.guard';
import { ServiceOrdersService } from '../../../services/http/service-orders.service';
import { EquipmentService } from '../../../services/http/equipment.service';
import { VisitsService } from '../../../services/http/visits.service';
import { UsersService } from '../../../services/http/users.service';
import { ServiceOrderStatus } from '../../../model/enums/service-order/service-order-status.enum';
import { VisitStatus } from '../../../model/enums/visit/visit-status.enum';
import {
  VisitCloseReasonLabelPipe,
  VisitStatusLabelPipe,
  VisitStatusSeverityPipe,
} from '../../../pipes/visit.pipe';
import { errorMessage, formatDurationMinutes } from '../../../data/utils';
import {
  DEFAULT_VISIT_DURATION_MINUTES,
  MAX_VISIT_DURATION_MINUTES,
} from '../../../model/constants/visit/visit-duration.const';
import type { VisitTimeSummary } from '../../../data/types/calendar/visit-time-summary.type';
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
 *  technician (omitted = backlog), the client's units, date + start time +
 *  **duration**, title, notes.
 *
 *  On an existing visit the surface narrows with the lifecycle, which is the
 *  immutable-record model made visible:
 *  - `scheduled` — full correction (date, duration, title, notes) + reassignment.
 *  - `in_progress` — **reassignment only**. Moving the date of a job a technician
 *    is physically performing is nonsense (the API 409s), but a mid-job handoff
 *    is real, so the technician select survives while everything else goes read-only.
 *  - terminal — read-only, apart from the owner/admin **actuals correction**,
 *    which this dialog hands off to its own dialog rather than inlining: it is a
 *    billing-grade edit and deserves its own confirmation.
 *
 *  Iniciar/Terminar are the field app's (CP-3); what shows here is what they
 *  recorded — Planeado vs Real with the variance. The full history is **not**
 *  here: it lives on the parent order's activity timeline (19 §7). */
@Component({
  selector: 'app-visit-dialog',
  imports: [
    DatePipe,
    RouterLink,
    ReactiveFormsModule,
    DialogModule,
    DatePickerModule,
    InputNumberModule,
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
  /** A mutation landed — the calendar reloads its window. */
  readonly changed = output<void>();
  /** Cerrar chosen — the parent opens the categorized-close dialog. */
  readonly closeRequested = output<Visit>();
  /** Corregir tiempos chosen — the parent opens the actuals dialog. */
  readonly actualsRequested = output<Visit>();

  private fb = inject(FormBuilder);
  private store = inject(Store);
  private actions$ = inject(Actions);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);
  private serviceOrders = inject(ServiceOrdersService);
  private equipmentApi = inject(EquipmentService);
  private visitsApi = inject(VisitsService);

  private me = select(AuthState.me);
  protected isStaff = computed(() => hasRole(this.me(), ['owner', 'admin', 'office']));
  /** Rewriting what a technician recorded as done is admin-tier (12 §2) —
   *  office schedules work, it does not restate the invoice. */
  private isAdminTier = computed(() => hasRole(this.me(), ['owner', 'admin']));

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
    duracion: [
      DEFAULT_VISIT_DURATION_MINUTES,
      [Validators.required, Validators.min(1), Validators.max(MAX_VISIT_DURATION_MINUTES)],
    ],
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
  protected isClosed = computed(() => this.target()?.status === VisitStatus.Closed);
  /** A missing `actualEnd` means two different things, and only the status can
   *  tell them apart: the job is still being performed, or it was completed from
   *  the admin and no end was ever recorded. Reading "en curso" on a visit
   *  someone already marked served would be plainly wrong. */
  protected isInProgress = computed(() => this.target()?.status === VisitStatus.InProgress);

  /** The visit's own code is the title — it is the handle people carry around,
   *  and a dialog headed "Visita" tells the reader nothing they didn't know. */
  protected dialogTitle = computed(() => this.target()?.internalCode ?? 'Nueva visita');

  /** Scheduling correction: staff, and no technician has touched it yet. */
  protected canCorrectSchedule = computed(() => {
    const visit = this.target();
    return this.isStaff() && (visit === null || visit.status === VisitStatus.Scheduled);
  });

  /** Reassignment survives into `in_progress` — a mid-job handoff is real. */
  protected canReassign = computed(() => {
    const visit = this.target();
    if (!this.isStaff()) return false;
    return (
      visit === null ||
      visit.status === VisitStatus.Scheduled ||
      visit.status === VisitStatus.InProgress
    );
  });

  /** Responder / Cerrar — while the visit is still live. */
  protected canAct = computed(() => !this.isCreate() && this.canReassign());

  /** The form is worth rendering at all only if something in it can change. */
  protected hasForm = computed(() => this.isCreate() || this.canReassign());

  protected canCorrectActuals = computed(() => {
    const visit = this.target();
    if (!visit || !this.isAdminTier()) return false;
    return visit.status === VisitStatus.Completed || visit.status === VisitStatus.Closed;
  });

  /** Planeado vs Real (12 §4) — the one place the numbers are read per visit. */
  protected timeSummary = computed<VisitTimeSummary | null>(() => {
    const visit = this.target();
    if (!visit) return null;
    const planned = visit.expectedDurationMinutes;
    const actual = visit.actualDurationMinutes;
    if (actual === undefined) {
      return {
        plannedDuration: formatDurationMinutes(planned),
        over: false,
        onEstimate: false,
      };
    }
    const diff = actual - planned;
    return {
      plannedDuration: formatDurationMinutes(planned),
      actualDuration: formatDurationMinutes(actual),
      // The minus is U+2212, not a hyphen: it aligns with digits in the
      // tabular `font-data` stack instead of sitting high and short.
      variance: diff === 0 ? undefined : `${diff > 0 ? '+' : '−'}${formatDurationMinutes(Math.abs(diff))}`,
      over: diff > 0,
      onEstimate: diff === 0,
    };
  });

  /** Read-only equipment names for a loaded visit. */
  protected equipmentNames = computed(() =>
    (this.target()?.equipment ?? []).map((link) => link.name || 'Equipo').join(', '),
  );

  constructor() {
    // The client — and therefore the offerable units — derives from the order.
    // Create-mode only: on an existing visit the order select never renders and
    // the client is fixed, so reacting to the reset's own `orderId` emission
    // would just wipe the equipment prefill `openVisit` set.
    this.form.controls.orderId.valueChanges.pipe(takeUntilDestroyed()).subscribe((orderId) => {
      if (this.target()) return;
      const customerId =
        this.lockedOrder()?.customerId ??
        this.orderOptions().find((option) => option.value === orderId)?.customerId;
      this.form.controls.equipmentIds.setValue([]);
      this.loadEquipment(customerId);
    });

    // Live re-narrow (12 CP-4): a stream frame for the visit this dialog has
    // open is the on-open re-read arriving on its own — apply it the same way,
    // so office watches "Programada" flip to "En curso" without reopening.
    this.actions$
      .pipe(ofActionDispatched(VisitEventReceived), takeUntilDestroyed())
      .subscribe(({ frame }: VisitEventReceived) => {
        const target = this.target();
        if (!this.dialogOpen() || !target || frame.visit.id !== target.id) return;
        if (frame.visit.updatedAt === target.updatedAt) return;
        this.applyVisit(frame.visit);
      });
  }

  /** New visit; `order` pins the selection (order view's "Programar visita"). */
  openCreate(order?: VisitOrderContext): void {
    this.target.set(null);
    this.lockedOrder.set(order ?? null);
    this.equipmentOptions.set([]);
    // Required on create only — see `openVisit` for why it comes off there.
    // Set before the reset so the reset's own validity pass already uses it.
    this.form.controls.orderId.setValidators(Validators.required);
    this.form.reset({
      orderId: order?.id ?? '',
      technicianId: '',
      equipmentIds: [],
      fecha: null,
      horaInicio: defaultStartTime(),
      duracion: DEFAULT_VISIT_DURATION_MINUTES,
      title: '',
      notes: '',
    });
    // The reset above already re-derived the equipment via `orderId`'s
    // valueChanges; a locked order needs no order list at all.
    if (!order) this.loadOpenOrders();
    this.submitting.set(false);
    this.dialogOpen.set(true);
  }

  /** Existing visit — the form narrows to whatever its status still allows.
   *  The row handed in comes from the parent's window read, which a field-app
   *  sync (Iniciar/Terminar) does not touch — so render it for an instant
   *  open, then re-read the single visit and re-narrow if the server knows
   *  better. */
  openVisit(visit: Visit): void {
    this.applyVisit(visit);
    this.visitsApi.get(visit.id).subscribe({
      next: (fresh) => {
        if (!this.dialogOpen() || this.target()?.id !== fresh.id) return;
        if (fresh.updatedAt === visit.updatedAt) return;
        this.applyVisit(fresh);
        // The stale row is the parent's too — let it refetch the window.
        this.changed.emit();
      },
      // Unreachable read: keep showing the row we were handed.
      error: () => undefined,
    });
  }

  private applyVisit(visit: Visit): void {
    this.target.set(visit);
    this.lockedOrder.set(null);
    this.equipmentOptions.set([]);
    // The order select is create-only, but the control stays in the group — and
    // a required validator on a field the form never renders would leave a
    // transition-era visit without an order (the DTO allows it) with a Guardar
    // that can never enable.
    this.form.controls.orderId.clearValidators();
    const start = new Date(visit.scheduledStart);
    this.form.reset({
      orderId: visit.serviceOrderId ?? '',
      technicianId: visit.technicianId ?? '',
      equipmentIds: visit.equipment.map((link) => link.id),
      fecha: start,
      horaInicio: start,
      duracion: visit.expectedDurationMinutes,
      title: visit.title ?? '',
      notes: visit.notes ?? '',
    });
    // Equipment links are correctable while `scheduled` (owner 2026-08-06) —
    // offer the customer's units; past that state the links render read-only.
    if (this.canCorrectSchedule()) this.loadEquipment(visit.customerId);
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

  /** Responder — the visit was served (12 §1). No `actualEnd`: office marking a
   *  visit served has no tap to report, and a stamp it invented would be
   *  indistinguishable from one a technician recorded. */
  protected respond(): void {
    const visit = this.target();
    if (!visit || this.submitting()) return;
    this.confirmation.confirm({
      header: 'Marcar como realizada',
      message:
        'La visita queda como realizada y ya no podrá editarse. No se registra una hora de fin: eso lo hace el técnico al terminar desde la app.',
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

  /** Corregir tiempos — likewise its own dialog. */
  protected requestActuals(): void {
    const visit = this.target();
    if (!visit) return;
    this.dialogOpen.set(false);
    this.actualsRequested.emit(visit);
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
          expectedDurationMinutes: raw.duracion,
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

  /** Correction and reassignment are separate endpoints (each appends its own
   *  event to the order's timeline); one Guardar dispatches whichever changed —
   *  and on an `in_progress` visit only the reassignment is even offered.
   *
   *  Each dispatch is wrapped in `defer` because NGXS dispatches at *call*
   *  time, not at subscribe time — bare dispatches in a `concat` would already
   *  be running in parallel, leaving the two timeline events in arbitrary order
   *  and letting the reassignment land even after the correction failed. */
  private saveCorrections(): void {
    const visit = this.target();
    if (!visit) return;
    const raw = this.form.getRawValue();
    if (!raw.fecha || !raw.horaInicio) return;

    const patch: CorrectVisitRequest = {};
    if (this.canCorrectSchedule()) {
      const start = atTime(raw.fecha, raw.horaInicio).toISOString();
      if (start !== visit.scheduledStart) patch.scheduledStart = start;
      // The end is derived server-side from start + duration, so this one field
      // is what moves it — there is no end to send and nothing to keep in step.
      if (raw.duracion !== visit.expectedDurationMinutes) patch.expectedDurationMinutes = raw.duracion;
      const title = raw.title.trim() || null;
      if ((title ?? undefined) !== visit.title) patch.title = title;
      const notes = raw.notes.trim() || null;
      if ((notes ?? undefined) !== visit.notes) patch.notes = notes;
      // Set comparison — reordering the same units is not a change. The backend
      // replaces the full link set and audits from → to on the order timeline.
      const currentEquipment = visit.equipment.map((link) => link.id).sort().join('\n');
      const nextEquipment = [...raw.equipmentIds].sort().join('\n');
      if (currentEquipment !== nextEquipment) patch.equipmentIds = raw.equipmentIds;
    }

    const technicianId = raw.technicianId || null;
    const techChanged = (technicianId ?? undefined) !== visit.technicianId;

    const ops: Observable<unknown>[] = [];
    if (Object.keys(patch).length > 0) {
      ops.push(defer(() => this.store.dispatch(new CorrectVisit(visit.id, patch))));
    }
    if (techChanged) {
      ops.push(defer(() => this.store.dispatch(new AssignVisit(visit.id, technicianId))));
    }
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

  /** The order select's options: open orders, capped at the first 100 — past
   *  that the rest silently vanish from the list. The day a tenant runs that
   *  many open orders at once, this becomes a server-side search like the
   *  customers lookup, not a bigger cap. */
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
    this.messages.add({
      severity: 'error',
      summary,
      detail: errorMessage(err, 'Inténtalo de nuevo.'),
    });
  }
}

/** Local-field date+time composition — never millisecond math. */
const atTime = (date: Date, time: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), time.getHours(), time.getMinutes());

/** The default visit start — mid-morning, the SMB "morning-ish" slot. */
const defaultStartTime = (): Date => new Date(1970, 0, 1, 9, 0);
