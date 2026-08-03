import type { Db } from '../../database/client';
import type { AuthUser } from '../../../env';
import { isUniqueViolation } from '../../database/db-errors';
import { isBackOfficeTier } from '../../auth/utils/role-tier';
import { findCustomerById } from '../../customers/repository/customers.repository';
import { findUserById } from '../../users/repository/users.repository';
import { findReportById } from '../../reports/repository/reports.repository';
import { findServiceOrderById } from '../../service-orders/repository/service-orders.repository';
import { ServiceOrderStatus } from '../../service-orders/enums/service-orders.enum';
import {
  OPEN_VISIT_STATUSES,
  TERMINAL_VISIT_STATUSES,
  VisitEventType,
  VisitStatus,
} from '../enums/visits.enum';
import {
  equipmentForVisit,
  equipmentForVisits,
  equipmentIdsForCustomer,
  findSuccessorId,
  findVisitById,
  findVisitWithMeta,
  insertRescheduledVisit,
  insertVisit,
  listVisitsInRange,
  updateVisit,
} from '../repository/visits.repository';
import { appendVisitEvent } from './visit-audit.service';
import { diffFields } from '../utils/field-diff';
import {
  EquipmentCustomerMismatchError,
  InvalidActualTimeError,
  VisitNotFoundError,
  OrderCustomerMismatchError,
  ReportCustomerMismatchError,
  ServiceOrderNotOpenError,
  TechnicianNotFoundError,
  VisitAlreadyRescheduledError,
  VisitCustomerNotFoundError,
  VisitNotAssignedToUserError,
  VisitNotClosedError,
  VisitNotCorrectableError,
  VisitNotOpenError,
  VisitNotStartableError,
  VisitNotTerminalError,
  VisitReadBackFailedError,
  VisitServiceOrderNotFoundError,
} from '../http-errors/visits.error';
import { UNASSIGNED } from '../validators/visits.validator';
import type {
  CorrectActualsInput,
  CorrectVisitInput,
  AssignVisitInput,
  CloseVisitInput,
  CreateVisitInput,
  ListVisitsQuery,
  RescheduleVisitInput,
  RespondVisitInput,
  StartVisitInput,
} from '../validators/visits.validator';
import type {
  AuthoredCorrectionFields,
  CorrectActualsFields,
  CorrectVisitFields,
  VisitDTO,
  VisitEquipmentLink,
  VisitRow,
  VisitWithMeta,
} from '../types/visits.types';

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

const MINUTE_MS = 60_000;

/** The booked window is *always* `start + expectedDurationMinutes`. Every write
 *  path that touches either half runs through here and stores the pair together,
 *  which is what makes `scheduled_end` a safe fast reference for range reads
 *  instead of a second source of truth that can drift (12 §1, owner
 *  2026-07-31). */
const derivedEnd = (start: Date, minutes: number): Date =>
  new Date(start.getTime() + minutes * MINUTE_MS);

/** Whole minutes between two stamps. Rounded, not floored: a 90-second job is
 *  two minutes of work, and flooring would report visits as shorter than they
 *  were on every single row — a bias that matters once this feeds billing. */
const minutesBetween = (start: Date, end: Date): number =>
  Math.round((end.getTime() - start.getTime()) / MINUTE_MS);

/** Field devices keep imperfect clocks, and a phone a few seconds fast would
 *  otherwise make Iniciar unusable in the field. Tolerating a small skew is the
 *  cost of accepting the *tap* time rather than the sync time; it is deliberately
 *  small enough that a genuinely wrong clock still gets caught. */
const CLOCK_SKEW_TOLERANCE_MS = 5 * MINUTE_MS;

/** The actual stamps are **trusted, not unchecked** (12 §5). The field app
 *  queues them offline and reports when the technician tapped, so the backend
 *  cannot substitute `now()` — but a time in the future or from before the visit
 *  existed is a broken device clock or a mangled queue entry, and letting it
 *  through would put a fabricated duration on an invoice. */
const assertPlausibleActual = (row: VisitRow, when: Date, label: string): void => {
  if (when.getTime() > Date.now() + CLOCK_SKEW_TOLERANCE_MS) {
    throw new InvalidActualTimeError(`La hora de ${label} no puede estar en el futuro.`);
  }
  if (when < row.createdAt) {
    throw new InvalidActualTimeError(
      `La hora de ${label} no puede ser anterior a la creación de la visita.`,
    );
  }
};

const toDTO = (
  meta: VisitWithMeta,
  equipment: VisitEquipmentLink[],
  rescheduledToId?: string | null,
): VisitDTO => {
  const { row } = meta;
  return {
    id: row.id,
    internalCode: row.internalCode,
    customerId: row.customerId,
    customerName: opt(meta.customerName),
    serviceOrderId: opt(row.serviceOrderId),
    serviceOrderFolio: opt(meta.serviceOrderFolio),
    technicianId: opt(row.technicianId),
    technicianName: opt(meta.technicianName),
    equipment,
    scheduledStart: row.scheduledStart.toISOString(),
    scheduledEnd: row.scheduledEnd ? row.scheduledEnd.toISOString() : undefined,
    expectedDurationMinutes: row.expectedDurationMinutes,
    actualStart: row.actualStart ? row.actualStart.toISOString() : undefined,
    actualEnd: row.actualEnd ? row.actualEnd.toISOString() : undefined,
    actualDurationMinutes: opt(row.actualDurationMinutes),
    status: row.status,
    closeReason: opt(row.closeReason),
    closeNote: opt(row.closeNote),
    rescheduledFromId: opt(row.rescheduledFromId),
    rescheduledToId: opt(rescheduledToId),
    reportId: opt(row.reportId),
    title: opt(row.title),
    notes: opt(row.notes),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
};

/** The write-path response shape: re-read with the joined names and the linked
 *  units so the frontend can apply one object to `selected` after any mutation. */
const detailDTO = async (db: Db, id: string): Promise<VisitDTO | null> => {
  const meta = await findVisitWithMeta(db, id);
  if (!meta) return null;
  const [equipment, successorId] = await Promise.all([
    equipmentForVisit(db, id),
    findSuccessorId(db, id),
  ]);
  return toDTO(meta, equipment, successorId);
};

/** The technician rule (12 §2a): staff act on any visit, a technician only on
 *  one currently assigned to them. This is what stops a tech responding to,
 *  closing, or giving away a colleague's visit — they may only give away their
 *  own. Unassigned visits are staff-only by the same rule. */
const assertMayAct = (row: VisitRow, user: AuthUser): void => {
  if (isBackOfficeTier(user)) return;
  if (row.technicianId !== user.id) throw new VisitNotAssignedToUserError();
};

/** Reassign, start, respond and close require the visit to still be **open** —
 *  which since 2026-07-31 means `scheduled` *or* `in_progress` (12 §1). */
const assertOpen = (row: VisitRow): void => {
  if (!OPEN_VISIT_STATUSES.includes(row.status)) throw new VisitNotOpenError(row.status);
};

/** Scheduling correction is narrower than open: it needs `scheduled`. Office
 *  must not move the date of a visit a technician is physically performing
 *  (owner 2026-07-31) — while reassignment deliberately stays available there,
 *  because a mid-job handoff is real. */
const assertCorrectable = (row: VisitRow): void => {
  if (row.status !== VisitStatus.Scheduled) throw new VisitNotCorrectableError(row.status);
};

/** Iniciar starts a visit that has not started. An `in_progress` visit was
 *  already tapped — most plausibly a duplicate entry from the offline queue,
 *  which must not restart the clock and lose the original `actualStart`. */
const assertStartable = (row: VisitRow): void => {
  if (row.status !== VisitStatus.Scheduled) throw new VisitNotStartableError(row.status);
};

/** The actuals correction is the one edit that reaches past a terminal state
 *  (12 §1), so it requires one. There is nothing to correct while the job is
 *  still running — the honest fix there is to let Terminar record the truth. */
const assertTerminal = (row: VisitRow): void => {
  if (!TERMINAL_VISIT_STATUSES.includes(row.status)) throw new VisitNotTerminalError(row.status);
};

/** The guarded update matched no row: the visit changed state between our read
 *  and our write. Re-read so the 409 names the state it actually reached
 *  instead of guessing — the client's next move differs for `completed` vs
 *  `closed`, and a soft-deleted row is a 404, not a conflict.
 *
 *  `toError` is the caller's own conflict, so a lost race reports the same rule
 *  the up-front check would have: correction says `visit_not_correctable`, the
 *  actuals correction says `visit_not_terminal`, and so on. */
const throwRaceLost = async (
  db: Db,
  id: string,
  toError: (status: VisitStatus) => Error = (status) => new VisitNotOpenError(status),
): Promise<never> => {
  const current = await findVisitById(db, id);
  if (!current) throw new VisitNotFoundError(id);
  throw toError(current.status);
};

/** Resolves the assignee, rejecting ids that don't name a live user before they
 *  reach the FK. `null` is legitimate — it parks the visit in the backlog. */
const assertTechnicianExists = async (db: Db, technicianId: string | null): Promise<void> => {
  if (!technicianId) return;
  const user = await findUserById(db, technicianId);
  if (!user || user.deletedAt) throw new TechnicianNotFoundError(technicianId);
};

/** Validates the parent order when one is supplied (it is optional until the
 *  service-orders module is finished).
 *
 *  Two rules, both hard stops. The order must still be **open** — a completed
 *  order is done and a cancelled one closes its scheduled visits (19 §1), so
 *  scheduling into either contradicts what the client was already told. And its
 *  client must be the visit's client: preferring one side of a mismatch would
 *  quietly schedule a job for the wrong party. */
const assertOrderSchedulable = async (
  db: Db,
  serviceOrderId: string | undefined,
  customerId: string,
): Promise<void> => {
  if (!serviceOrderId) return;
  const order = await findServiceOrderById(db, serviceOrderId);
  if (!order) throw new VisitServiceOrderNotFoundError(serviceOrderId);
  if (order.status !== ServiceOrderStatus.Open) {
    throw new ServiceOrderNotOpenError(order.status);
  }
  if (order.customerId !== customerId) {
    throw new OrderCustomerMismatchError(serviceOrderId, customerId);
  }
};

/** Units must belong to the visit's customer — equipment is client-scoped, so a
 *  foreign unit is a data error worth naming rather than silently dropping. */
const assertEquipmentBelongsToCustomer = async (
  db: Db,
  customerId: string,
  ids: string[],
): Promise<void> => {
  if (!ids.length) return;
  const owned = new Set(await equipmentIdsForCustomer(db, customerId, ids));
  const foreign = ids.filter((id) => !owned.has(id));
  if (foreign.length) throw new EquipmentCustomerMismatchError(foreign);
};

/** The calendar's week read (12 §5). Range-bounded, no pagination — or narrowed
 *  by an `internalCode` prefix instead, which is the one legitimate way to ask
 *  without knowing the date. */
export const getVisits = async (db: Db, query: ListVisitsQuery): Promise<VisitDTO[]> => {
  const unassigned = query.technicianId === UNASSIGNED;
  const rows = await listVisitsInRange(db, {
    from: query.from,
    to: query.to,
    internalCode: query.internalCode,
    unassigned,
    technicianId: unassigned ? undefined : query.technicianId,
    customerId: query.customerId,
    status: query.status,
  });
  // One query for every linked unit in the window, then grouped in memory —
  // the alternative is a round trip per chip, and a week is hundreds of chips.
  const equipment = await equipmentForVisits(db, rows.map((r) => r.row.id));
  return rows.map((meta) => toDTO(meta, equipment.get(meta.row.id) ?? []));
};

/** The immutable record plus its reschedule chain (12 §5). The audit trail is
 *  deliberately absent — it lives on the parent order's timeline (19 §7). */
export const getVisitById = async (db: Db, id: string): Promise<VisitDTO | null> =>
  detailDTO(db, id);

export const createVisit = async (
  db: Db,
  input: CreateVisitInput,
  actorId: string,
): Promise<VisitDTO> => {
  const customer = await findCustomerById(db, input.customerId);
  if (!customer || customer.deletedAt) throw new VisitCustomerNotFoundError(input.customerId);

  await assertOrderSchedulable(db, input.serviceOrderId, input.customerId);
  const technicianId = input.technicianId ?? null;
  await assertTechnicianExists(db, technicianId);
  const equipmentIds = input.equipmentIds ?? [];
  await assertEquipmentBelongsToCustomer(db, input.customerId, equipmentIds);

  const visit = await insertVisit(
    db,
    {
      customerId: input.customerId,
      serviceOrderId: input.serviceOrderId ?? null,
      technicianId,
      scheduledStart: input.scheduledStart,
      // Derived, never supplied — see `derivedEnd`.
      scheduledEnd: derivedEnd(input.scheduledStart, input.expectedDurationMinutes),
      expectedDurationMinutes: input.expectedDurationMinutes,
      title: input.title ?? null,
      notes: input.notes ?? null,
      status: VisitStatus.Scheduled,
      createdBy: actorId,
    },
    equipmentIds,
    (tx, row) =>
      appendVisitEvent(tx, {
        serviceOrderId: row.serviceOrderId,
        type: VisitEventType.Created,
        actorId,
        visitId: row.id,
      }),
  );
  const dto = await detailDTO(db, visit.id);
  if (!dto) throw new VisitReadBackFailedError(visit.id, 'createVisit');
  return dto;
};

/** Correction of a **scheduled** visit (12 §4) — scheduling fields only, staff
 *  only. Returns null when the visit doesn't exist; throws once it is
 *  `in_progress` or terminal. */
export const correctVisit = async (
  db: Db,
  id: string,
  input: CorrectVisitInput,
  actorId: string,
): Promise<VisitDTO | null> => {
  const row = await findVisitById(db, id);
  if (!row) return null;
  assertCorrectable(row);

  // What the caller actually authored. Keys are added only when supplied —
  // `diffFields` walks `Object.entries`, so a key present-but-undefined would
  // land in the trail as a change to null.
  const authored: AuthoredCorrectionFields = {};
  if (input.scheduledStart !== undefined) authored.scheduledStart = input.scheduledStart;
  if (input.expectedDurationMinutes !== undefined) {
    authored.expectedDurationMinutes = input.expectedDurationMinutes;
  }
  if (input.title !== undefined) authored.title = input.title;
  if (input.notes !== undefined) authored.notes = input.notes;

  // Diff the authored fields only. `scheduledEnd` is deliberately absent from
  // the trail: it is derived from the two above, so recording it as well would
  // put the same move in the timeline twice.
  const changes = diffFields(
    {
      scheduledStart: row.scheduledStart,
      expectedDurationMinutes: row.expectedDurationMinutes,
      title: row.title,
      notes: row.notes,
    },
    authored,
  );
  // A correction that changes nothing is a successful no-op, not a timeline
  // entry — the trail records what moved, never what was merely submitted.
  if (!changes) return detailDTO(db, id);

  // Either half of the planned window moving re-derives the other. Merged
  // against the stored row, because a correction may send only one of them.
  // There is no start/end coherence check any more: the duration is validated
  // positive, so a derived end is always after its start by construction.
  const fields: CorrectVisitFields = { ...authored };
  if (authored.scheduledStart !== undefined || authored.expectedDurationMinutes !== undefined) {
    fields.scheduledEnd = derivedEnd(
      authored.scheduledStart ?? row.scheduledStart,
      authored.expectedDurationMinutes ?? row.expectedDurationMinutes,
    );
  }

  const updated = await updateVisit(db, id, fields, [VisitStatus.Scheduled], (tx, visit) =>
    appendVisitEvent(tx, {
      serviceOrderId: visit.serviceOrderId,
      type: VisitEventType.Corrected,
      actorId,
      visitId: visit.id,
      changes,
    }),
  );
  if (!updated) {
    return throwRaceLost(db, id, (status) => new VisitNotCorrectableError(status));
  }
  return detailDTO(db, id);
};

/** Reassignment on an open visit (12 §5). Staff reassign freely; a technician
 *  may only hand off a visit that is currently theirs (the §2a swap).
 *
 *  Deliberately reachable while `in_progress` (owner 2026-07-31): a technician
 *  falling ill mid-job and a colleague taking it over is real, and refusing it
 *  would only push the handoff outside the audit trail. */
export const assignVisit = async (
  db: Db,
  id: string,
  input: AssignVisitInput,
  user: AuthUser,
): Promise<VisitDTO | null> => {
  const row = await findVisitById(db, id);
  if (!row) return null;
  assertOpen(row);
  assertMayAct(row, user);
  await assertTechnicianExists(db, input.technicianId);

  const changes = diffFields({ technicianId: row.technicianId }, {
    technicianId: input.technicianId,
  });
  if (!changes) return detailDTO(db, id);

  const updated = await updateVisit(
    db,
    id,
    { technicianId: input.technicianId },
    OPEN_VISIT_STATUSES,
    (tx, visit) =>
      appendVisitEvent(tx, {
        serviceOrderId: visit.serviceOrderId,
        type: VisitEventType.Reassigned,
        actorId: user.id,
        visitId: visit.id,
        changes,
      }),
  );
  if (!updated) return throwRaceLost(db, id);
  return detailDTO(db, id);
};

/** **Iniciar** (12 §5, owner 2026-07-31) — the technician started the job.
 *  Stamps `actualStart` and moves `scheduled → in_progress`, so office can see
 *  who is on site right now.
 *
 *  The timestamp comes from the client and is trusted after validation: the
 *  field app queues this offline and syncs on reconnect, so stamping `now()`
 *  here would record when the truck regained signal rather than when the work
 *  began — and bill the difference. */
export const startVisit = async (
  db: Db,
  id: string,
  input: StartVisitInput,
  user: AuthUser,
): Promise<VisitDTO | null> => {
  const row = await findVisitById(db, id);
  if (!row) return null;
  assertStartable(row);
  assertMayAct(row, user);
  assertPlausibleActual(row, input.actualStart, 'inicio');

  const updated = await updateVisit(
    db,
    id,
    { status: VisitStatus.InProgress, actualStart: input.actualStart },
    [VisitStatus.Scheduled],
    (tx, visit) =>
      appendVisitEvent(tx, {
        serviceOrderId: visit.serviceOrderId,
        type: VisitEventType.Started,
        actorId: user.id,
        visitId: visit.id,
      }),
  );
  if (!updated) return throwRaceLost(db, id, (status) => new VisitNotStartableError(status));
  return detailDTO(db, id);
};

/** Respond — **Terminar**: the visit was served (12 §5). Links the produced
 *  report when one is supplied; staff may also mark it served without one.
 *
 *  Reachable from either open state. From `in_progress` it closes the loop the
 *  field app opened with Iniciar; from `scheduled` it is office recording a job
 *  whose start nobody tapped, which is exactly why `actualEnd` is optional and
 *  the duration only materializes when both stamps exist. */
export const respondVisit = async (
  db: Db,
  id: string,
  input: RespondVisitInput,
  user: AuthUser,
): Promise<VisitDTO | null> => {
  const row = await findVisitById(db, id);
  if (!row) return null;
  assertOpen(row);
  assertMayAct(row, user);

  if (input.reportId) {
    const report = await findReportById(db, input.reportId);
    if (!report || report.clientId !== row.customerId) {
      throw new ReportCustomerMismatchError(input.reportId);
    }
  }

  const actualEnd = input.actualEnd ?? row.actualEnd;
  if (input.actualEnd) {
    assertPlausibleActual(row, input.actualEnd, 'fin');
    if (row.actualStart && input.actualEnd < row.actualStart) {
      throw new InvalidActualTimeError('La hora de fin no puede ser anterior a la de inicio.');
    }
  }

  const updated = await updateVisit(
    db,
    id,
    {
      status: VisitStatus.Completed,
      reportId: input.reportId ?? row.reportId,
      actualEnd,
      // Only derivable with both halves. A visit completed from the admin with
      // no Iniciar behind it keeps a null duration rather than a made-up one —
      // an absent number is honest, a fabricated one bills wrong.
      actualDurationMinutes:
        row.actualStart && actualEnd
          ? minutesBetween(row.actualStart, actualEnd)
          : row.actualDurationMinutes,
    },
    OPEN_VISIT_STATUSES,
    (tx, visit) =>
      appendVisitEvent(tx, {
        serviceOrderId: visit.serviceOrderId,
        type: VisitEventType.Completed,
        actorId: user.id,
        visitId: visit.id,
      }),
  );
  if (!updated) return throwRaceLost(db, id);
  return detailDTO(db, id);
};

/** Correct the actual times on a terminal visit (12 §1/§2, owner 2026-07-31) —
 *  owner/admin only, gated at the route.
 *
 *  This is the single edit that reaches past a terminal state, and it earns the
 *  exception: a mis-tapped Iniciar would otherwise bill wrong forever. The trail
 *  keeps both the original stamp and the fix, which is what makes rewriting a
 *  technician's record acceptable at all. */
export const correctVisitActuals = async (
  db: Db,
  id: string,
  input: CorrectActualsInput,
  actorId: string,
): Promise<VisitDTO | null> => {
  const row = await findVisitById(db, id);
  if (!row) return null;
  assertTerminal(row);

  // Same rule as the scheduling correction: keys only when supplied, so an
  // untouched stamp cannot reach the trail as a change to null.
  const authored: CorrectActualsFields = {};
  if (input.actualStart !== undefined) authored.actualStart = input.actualStart;
  if (input.actualEnd !== undefined) authored.actualEnd = input.actualEnd;

  if (authored.actualStart) assertPlausibleActual(row, authored.actualStart, 'inicio');
  if (authored.actualEnd) assertPlausibleActual(row, authored.actualEnd, 'fin');

  // Coherence is checked against the merged record: a correction may fix only
  // one stamp, and the other half still lives in the DB.
  const start = authored.actualStart ?? row.actualStart;
  const end = authored.actualEnd ?? row.actualEnd;
  if (start && end && end < start) {
    throw new InvalidActualTimeError('La hora de fin no puede ser anterior a la de inicio.');
  }

  const changes = diffFields(
    { actualStart: row.actualStart, actualEnd: row.actualEnd },
    authored,
  );
  if (!changes) return detailDTO(db, id);

  const updated = await updateVisit(
    db,
    id,
    {
      ...authored,
      actualDurationMinutes: start && end ? minutesBetween(start, end) : row.actualDurationMinutes,
    },
    TERMINAL_VISIT_STATUSES,
    (tx, visit) =>
      appendVisitEvent(tx, {
        serviceOrderId: visit.serviceOrderId,
        type: VisitEventType.ActualsCorrected,
        actorId,
        visitId: visit.id,
        changes,
      }),
  );
  if (!updated) return throwRaceLost(db, id, (status) => new VisitNotTerminalError(status));
  return detailDTO(db, id);
};

/** Close with a categorized reason (12 §5). Terminal — the caller is then
 *  prompted to reschedule now or later, which mints a separate record.
 *
 *  Still reachable from `in_progress`: a technician who starts a job and then
 *  cannot finish it (no access to the roof, the client sends them away) has to
 *  be able to say so, and the `actualStart` already on the row is what makes the
 *  abandoned attempt visible afterwards. */
export const closeVisit = async (
  db: Db,
  id: string,
  input: CloseVisitInput,
  user: AuthUser,
): Promise<VisitDTO | null> => {
  const row = await findVisitById(db, id);
  if (!row) return null;
  assertOpen(row);
  assertMayAct(row, user);

  const updated = await updateVisit(
    db,
    id,
    {
      status: VisitStatus.Closed,
      closeReason: input.reason,
      closeNote: input.note ?? null,
    },
    OPEN_VISIT_STATUSES,
    (tx, visit) =>
      appendVisitEvent(tx, {
        serviceOrderId: visit.serviceOrderId,
        type: VisitEventType.Closed,
        actorId: user.id,
        visitId: visit.id,
        // The timeline stores category + note as one readable line: this is what
        // the client eventually reads on the handoff document.
        note: input.note ? `${input.reason}: ${input.note}` : input.reason,
      }),
  );
  if (!updated) return throwRaceLost(db, id);
  return detailDTO(db, id);
};

/** Reschedule (12 §1) — never an edit. Mints the successor of a **closed**
 *  visit, inheriting its order, client, scope and (by default) its technician.
 *  The chain link goes on the new row; the closed one is never touched. */
export const rescheduleVisit = async (
  db: Db,
  id: string,
  input: RescheduleVisitInput,
  user: AuthUser,
): Promise<VisitDTO | null> => {
  const row = await findVisitById(db, id);
  if (!row) return null;
  if (row.status !== VisitStatus.Closed) throw new VisitNotClosedError(row.status);
  assertMayAct(row, user);

  // Rescheduling *creates* a visit, so it answers to the same rule `createVisit`
  // does: no new work may be scheduled onto an order that is no longer open.
  // Without this the one path is a way around the other — a cancelled order
  // closes its visits (19 §1), and rescheduling one of them would put fresh
  // work back on a job the client was already told is off.
  await assertOrderSchedulable(db, row.serviceOrderId ?? undefined, row.customerId);

  // Omitted = keep whoever had it; explicit null = back to the backlog.
  const technicianId = input.technicianId === undefined ? row.technicianId : input.technicianId;
  await assertTechnicianExists(db, technicianId);

  // Same job on a new date takes the same time unless told otherwise. The
  // successor's actuals stay null — it has not happened yet, and copying them
  // would attribute the closed visit's work to a visit nobody has made.
  const expectedDurationMinutes =
    input.expectedDurationMinutes ?? row.expectedDurationMinutes;

  let created: VisitRow | null;
  try {
    created = await insertRescheduledVisit(
      db,
      id,
      {
        customerId: row.customerId,
        serviceOrderId: row.serviceOrderId,
        technicianId,
        scheduledStart: input.scheduledStart,
        scheduledEnd: derivedEnd(input.scheduledStart, expectedDurationMinutes),
        expectedDurationMinutes,
        title: row.title,
        notes: row.notes,
        status: VisitStatus.Scheduled,
        rescheduledFromId: row.id,
        createdBy: user.id,
      },
      (tx, visit) =>
        appendVisitEvent(tx, {
          serviceOrderId: visit.serviceOrderId,
          type: VisitEventType.Rescheduled,
          actorId: user.id,
          // The event hangs off the visit being replaced and points forward to
          // its successor — that is the direction the timeline is read in.
          visitId: row.id,
          note: `→ ${visit.id}`,
        }),
    );
  } catch (err) {
    // The unique index on `rescheduled_from_id` is what actually prevents a
    // forked chain under concurrency.
    if (isUniqueViolation(err)) throw new VisitAlreadyRescheduledError(id);
    throw err;
  }
  // The parent stopped being `closed` between the read and the insert. Re-read
  // rather than naming a status: the row may also have been soft-deleted, which
  // is a 404, and asserting `scheduled` here would have reported a state the
  // visit was never in.
  if (!created) return throwRaceLost(db, id, (status) => new VisitNotClosedError(status));

  // Same invariant as `createVisit`, asserted the same way on purpose.
  const dto = await detailDTO(db, created.id);
  if (!dto) throw new VisitReadBackFailedError(created.id, 'rescheduleVisit');
  return dto;
};
