import { and, asc, eq, gte, isNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../../database/client';
import { scheduledVisits, visitEvents } from '../models/visits.model';
import { customers } from '../../customers/models/customers.model';
import { users } from '../../users/models/users.model';
import { VisitEventType, VisitStatus } from '../enums/visits.enum';
import type {
  NewVisit,
  RescheduleResult,
  UpdateVisitFields,
  VisitChanges,
  VisitEventEntry,
  VisitListFilters,
  VisitRow,
  VisitWithNames,
} from '../types/visits.types';

const activeFilter = isNull(scheduledVisits.deletedAt);

// A query executor: pooled Db or a transaction handle — both expose the same
// builder, so event-writing helpers compose inside a mutation's transaction.
type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
type Executor = Db | Tx;

// Display name for chips/history: first name + paternal surname (rows that
// predate the surname split carry their full name in `name`).
const displayName = (name: string | null, paternalLastName: string | null): string | null =>
  name ? [name, paternalLastName].filter(Boolean).join(' ') : null;

interface EventInput {
  visitId: string;
  type: VisitEventType;
  actorId: string;
  fromTechnicianId?: string | null;
  toTechnicianId?: string | null;
  changes?: VisitChanges;
  note?: string | null;
}

const insertEvent = async (tx: Executor, event: EventInput): Promise<void> => {
  await tx.insert(visitEvents).values({
    visitId: event.visitId,
    type: event.type,
    actorId: event.actorId,
    fromTechnicianId: event.fromTechnicianId ?? null,
    toTechnicianId: event.toTechnicianId ?? null,
    changes: event.changes ?? {},
    note: event.note ?? null,
  });
};

export const listVisits = async (db: Db, filters: VisitListFilters): Promise<VisitWithNames[]> => {
  const conds = [
    activeFilter,
    gte(scheduledVisits.scheduledStart, filters.from),
    lt(scheduledVisits.scheduledStart, filters.to),
  ];
  if (filters.technicianId) conds.push(eq(scheduledVisits.technicianId, filters.technicianId));
  if (filters.customerId) conds.push(eq(scheduledVisits.customerId, filters.customerId));
  if (filters.status) conds.push(eq(scheduledVisits.status, filters.status));
  const rows = await db
    .select({
      visit: scheduledVisits,
      customerName: customers.name,
      technicianName: users.name,
      technicianPaternal: users.paternalLastName,
    })
    .from(scheduledVisits)
    .leftJoin(customers, eq(scheduledVisits.customerId, customers.id))
    .leftJoin(users, eq(scheduledVisits.technicianId, users.id))
    .where(and(...conds))
    .orderBy(asc(scheduledVisits.scheduledStart));
  return rows.map((r) => ({
    ...r.visit,
    customerName: r.customerName,
    technicianName: displayName(r.technicianName, r.technicianPaternal),
  }));
};

export const findVisitById = async (db: Db, id: string): Promise<VisitRow | null> => {
  const [row] = await db
    .select()
    .from(scheduledVisits)
    .where(and(eq(scheduledVisits.id, id), activeFilter))
    .limit(1);
  return row ?? null;
};

export const findVisitWithNames = async (db: Db, id: string): Promise<VisitWithNames | null> => {
  const [row] = await db
    .select({
      visit: scheduledVisits,
      customerName: customers.name,
      technicianName: users.name,
      technicianPaternal: users.paternalLastName,
    })
    .from(scheduledVisits)
    .leftJoin(customers, eq(scheduledVisits.customerId, customers.id))
    .leftJoin(users, eq(scheduledVisits.technicianId, users.id))
    .where(and(eq(scheduledVisits.id, id), activeFilter))
    .limit(1);
  if (!row) return null;
  return {
    ...row.visit,
    customerName: row.customerName,
    technicianName: displayName(row.technicianName, row.technicianPaternal),
  };
};

export const listVisitEvents = async (db: Db, visitId: string): Promise<VisitEventEntry[]> => {
  const actor = alias(users, 'actor');
  const fromTech = alias(users, 'from_tech');
  const toTech = alias(users, 'to_tech');
  const rows = await db
    .select({
      event: visitEvents,
      actorName: actor.name,
      actorPaternal: actor.paternalLastName,
      fromName: fromTech.name,
      fromPaternal: fromTech.paternalLastName,
      toName: toTech.name,
      toPaternal: toTech.paternalLastName,
    })
    .from(visitEvents)
    .leftJoin(actor, eq(visitEvents.actorId, actor.id))
    .leftJoin(fromTech, eq(visitEvents.fromTechnicianId, fromTech.id))
    .leftJoin(toTech, eq(visitEvents.toTechnicianId, toTech.id))
    .where(eq(visitEvents.visitId, visitId))
    .orderBy(asc(visitEvents.createdAt));
  return rows.map((r) => ({
    ...r.event,
    actorName: displayName(r.actorName, r.actorPaternal),
    fromTechnicianName: displayName(r.fromName, r.fromPaternal),
    toTechnicianName: displayName(r.toName, r.toPaternal),
  }));
};

// Insert + open the audit trail with a `created` event in ONE transaction. When
// born assigned, the created event carries the initial technician (from null),
// so it doubles as the birth assignment record.
export const insertVisit = async (db: Db, values: NewVisit): Promise<VisitRow> =>
  db.transaction(async (tx) => {
    const [visit] = await tx.insert(scheduledVisits).values(values).returning();
    if (!visit) throw new Error('insertVisit returned no row');
    await insertEvent(tx, {
      visitId: visit.id,
      type: VisitEventType.Created,
      actorId: visit.createdBy,
      toTechnicianId: visit.technicianId,
    });
    return visit;
  });

// Field edit (benign date move, title/notes) + an `updated` event carrying the
// diff, in one transaction. `changes` is precomputed by the service.
export const updateVisit = async (
  db: Db,
  id: string,
  fields: UpdateVisitFields,
  changes: VisitChanges,
  actorId: string,
): Promise<VisitRow | null> =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .update(scheduledVisits)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(scheduledVisits.id, id), activeFilter))
      .returning();
    if (!row) return null;
    await insertEvent(tx, {
      visitId: id,
      type: VisitEventType.Updated,
      actorId,
      changes,
    });
    return row;
  });

// Reassign + append the audit entry atomically — the only path that mutates
// technician_id after birth.
export const reassignVisit = async (
  db: Db,
  id: string,
  fromTechnicianId: string | null,
  toTechnicianId: string | null,
  actorId: string,
): Promise<VisitRow | null> =>
  db.transaction(async (tx) => {
    const [visit] = await tx
      .update(scheduledVisits)
      .set({ technicianId: toTechnicianId, updatedAt: new Date() })
      .where(and(eq(scheduledVisits.id, id), activeFilter))
      .returning();
    if (!visit) return null;
    await insertEvent(tx, {
      visitId: id,
      type: VisitEventType.Assigned,
      actorId,
      fromTechnicianId,
      toTechnicianId,
      changes: {
        technicianId: { from: fromTechnicianId, to: toTechnicianId },
      },
    });
    return visit;
  });

export const updateVisitStatus = async (
  db: Db,
  id: string,
  fromStatus: VisitStatus,
  toStatus: VisitStatus,
  statusReason: string | null,
  actorId: string,
): Promise<VisitRow | null> =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .update(scheduledVisits)
      .set({ status: toStatus, statusReason, updatedAt: new Date() })
      .where(and(eq(scheduledVisits.id, id), activeFilter))
      .returning();
    if (!row) return null;
    await insertEvent(tx, {
      visitId: id,
      type: VisitEventType.StatusChanged,
      actorId,
      changes: { status: { from: fromStatus, to: toStatus } },
      note: statusReason,
    });
    return row;
  });

// Reschedule = close the original (rescheduled, reason) + open a fresh scheduled
// record carrying the chain link, in ONE transaction. Both sides get an event:
// the original a `rescheduled`, the replacement a `created`.
export const rescheduleVisit = async (
  db: Db,
  original: VisitRow,
  fields: {
    scheduledStart: Date;
    scheduledEnd: Date | null;
    technicianId: string | null;
    reason: string;
    actorId: string;
  },
): Promise<RescheduleResult> =>
  db.transaction(async (tx) => {
    const now = new Date();
    const [closed] = await tx
      .update(scheduledVisits)
      .set({
        status: VisitStatus.Rescheduled,
        statusReason: fields.reason,
        updatedAt: now,
      })
      .where(and(eq(scheduledVisits.id, original.id), activeFilter))
      .returning();
    if (!closed) throw new Error('rescheduleVisit: original row vanished mid-transaction');
    const [visit] = await tx
      .insert(scheduledVisits)
      .values({
        customerId: original.customerId,
        technicianId: fields.technicianId,
        scheduledStart: fields.scheduledStart,
        scheduledEnd: fields.scheduledEnd,
        title: original.title,
        notes: original.notes,
        rescheduledFromId: original.id,
        createdBy: fields.actorId,
      })
      .returning();
    if (!visit) throw new Error('rescheduleVisit returned no replacement row');
    await insertEvent(tx, {
      visitId: original.id,
      type: VisitEventType.Rescheduled,
      actorId: fields.actorId,
      note: fields.reason,
      changes: {
        scheduledStart: {
          from: original.scheduledStart.toISOString(),
          to: fields.scheduledStart.toISOString(),
        },
      },
    });
    await insertEvent(tx, {
      visitId: visit.id,
      type: VisitEventType.Created,
      actorId: fields.actorId,
      toTechnicianId: visit.technicianId,
    });
    return { closed, visit };
  });
