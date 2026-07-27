import type { Db } from '../../database/client';
import type { AuthUser } from '../../../env';
import { isUniqueViolation } from '../../database/db-errors';
import { isBackOfficeTier } from '../../auth/utils/role-tier';
import { findCustomerById } from '../../customers/repository/customers.repository';
import { findUserById } from '../../users/repository/users.repository';
import { findReportById } from '../../reports/repository/reports.repository';
import { findServiceOrderById } from '../../service-orders/repository/service-orders.repository';
import { ServiceOrderStatus } from '../../service-orders/enums/service-orders.enum';
import { VisitEventType, VisitStatus } from '../enums/visits.enum';
import {
  equipmentForVisit,
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
  VisitNotFoundError,
  OrderCustomerMismatchError,
  ReportCustomerMismatchError,
  ServiceOrderNotOpenError,
  TechnicianNotFoundError,
  VisitAlreadyRescheduledError,
  VisitCustomerNotFoundError,
  VisitNotAssignedToUserError,
  VisitNotClosedError,
  VisitNotOpenError,
  VisitServiceOrderNotFoundError,
} from '../http-errors/visits.error';
import { UNASSIGNED } from '../validators/visits.validator';
import type {
  CorrectVisitInput,
  AssignVisitInput,
  CloseVisitInput,
  CreateVisitInput,
  ListVisitsQuery,
  RescheduleVisitInput,
  RespondVisitInput,
} from '../validators/visits.validator';
import type {
  CorrectVisitFields,
  VisitDTO,
  VisitEquipmentLink,
  VisitRow,
  VisitWithMeta,
} from '../types/visits.types';

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

const toDTO = (
  meta: VisitWithMeta,
  equipment: VisitEquipmentLink[],
  rescheduledToId?: string | null,
): VisitDTO => {
  const { row } = meta;
  return {
    id: row.id,
    customerId: row.customerId,
    customerName: opt(meta.customerName),
    serviceOrderId: opt(row.serviceOrderId),
    serviceOrderFolio: opt(meta.serviceOrderFolio),
    technicianId: opt(row.technicianId),
    technicianName: opt(meta.technicianName),
    equipment,
    scheduledStart: row.scheduledStart.toISOString(),
    scheduledEnd: row.scheduledEnd ? row.scheduledEnd.toISOString() : undefined,
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

/** Every mutation but reschedule requires the visit to still be open (12 §1). */
const assertOpen = (row: VisitRow): void => {
  if (row.status !== VisitStatus.Scheduled) throw new VisitNotOpenError(row.status);
};

/** The guarded update matched no row: the visit went terminal between our read
 *  and our write. Re-read so the 409 names the state it actually reached
 *  instead of guessing — the client's next move differs for `completed` vs
 *  `closed`, and a soft-deleted row is a 404, not a conflict. */
const throwRaceLost = async (db: Db, id: string): Promise<never> => {
  const current = await findVisitById(db, id);
  if (!current) throw new VisitNotFoundError(id);
  throw new VisitNotOpenError(current.status);
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

/** The calendar's week read (12 §5). Range-bounded, no pagination. */
export const getVisits = async (db: Db, query: ListVisitsQuery): Promise<VisitDTO[]> => {
  const unassigned = query.technicianId === UNASSIGNED;
  const rows = await listVisitsInRange(db, {
    from: query.from,
    to: query.to,
    unassigned,
    technicianId: unassigned ? undefined : query.technicianId,
    customerId: query.customerId,
    status: query.status,
  });
  // One query for every linked unit in the window, then grouped in memory —
  // the alternative is a round trip per chip, and a week is hundreds of chips.
  const equipment = await Promise.all(rows.map((r) => equipmentForVisit(db, r.row.id)));
  return rows.map((meta, i) => toDTO(meta, equipment[i] ?? []));
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
      scheduledEnd: input.scheduledEnd ?? null,
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
  if (!dto) throw new Error('createVisit could not re-read the created visit');
  return dto;
};

/** Correction of an open visit (12 §4) — scheduling fields only, staff only.
 *  Returns null when the visit doesn't exist; throws when it is terminal. */
export const correctVisit = async (
  db: Db,
  id: string,
  input: CorrectVisitInput,
  actorId: string,
): Promise<VisitDTO | null> => {
  const row = await findVisitById(db, id);
  if (!row) return null;
  assertOpen(row);

  const fields: CorrectVisitFields = {};
  if (input.scheduledStart !== undefined) fields.scheduledStart = input.scheduledStart;
  if (input.scheduledEnd !== undefined) fields.scheduledEnd = input.scheduledEnd;
  if (input.title !== undefined) fields.title = input.title;
  if (input.notes !== undefined) fields.notes = input.notes;

  // Coherence is checked against the merged record: a correction may move only
  // one end of the window, and the other half still lives in the DB.
  const start = fields.scheduledStart ?? row.scheduledStart;
  const end = fields.scheduledEnd === undefined ? row.scheduledEnd : fields.scheduledEnd;
  if (end && end <= start) {
    throw new RangeError('scheduledEnd must be after scheduledStart');
  }

  // Diff against only the correctable columns — passing the whole row would
  // invite an unrelated field into the trail the moment one is added.
  const changes = diffFields(
    {
      scheduledStart: row.scheduledStart,
      scheduledEnd: row.scheduledEnd,
      title: row.title,
      notes: row.notes,
    },
    fields,
  );
  // A correction that changes nothing is a successful no-op, not a timeline
  // entry — the trail records what moved, never what was merely submitted.
  if (!changes) return detailDTO(db, id);

  const updated = await updateVisit(db, id, fields, VisitStatus.Scheduled, (tx, visit) =>
    appendVisitEvent(tx, {
      serviceOrderId: visit.serviceOrderId,
      type: VisitEventType.Corrected,
      actorId,
      visitId: visit.id,
      changes,
    }),
  );
  if (!updated) return throwRaceLost(db, id);
  return detailDTO(db, id);
};

/** Reassignment on an open visit (12 §5). Staff reassign freely; a technician
 *  may only hand off a visit that is currently theirs (the §2a swap). */
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
    VisitStatus.Scheduled,
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

/** Respond — the visit was served (12 §5). Links the produced report when one
 *  is supplied; staff may also mark it served without one. */
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

  const updated = await updateVisit(
    db,
    id,
    { status: VisitStatus.Completed, reportId: input.reportId ?? row.reportId },
    VisitStatus.Scheduled,
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

/** Close with a categorized reason (12 §5). Terminal — the caller is then
 *  prompted to reschedule now or later, which mints a separate record. */
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
    VisitStatus.Scheduled,
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

  // Omitted = keep whoever had it; explicit null = back to the backlog.
  const technicianId = input.technicianId === undefined ? row.technicianId : input.technicianId;
  await assertTechnicianExists(db, technicianId);

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
        scheduledEnd: input.scheduledEnd ?? null,
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
  // The parent stopped being `closed` between the read and the insert.
  if (!created) throw new VisitNotClosedError(VisitStatus.Scheduled);
  return detailDTO(db, created.id);
};
