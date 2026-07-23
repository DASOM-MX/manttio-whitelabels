import { and, asc, eq, gte, isNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../../database/client';
import { scheduledVisits, visitAssignments } from '../models/visits.model';
import { customers } from '../../customers/models/customers.model';
import { users } from '../../users/models/users.model';
import { VisitStatus } from '../enums/visits.enum';
import type {
  AssignmentEntry,
  NewVisit,
  RescheduleResult,
  UpdateVisitFields,
  VisitListFilters,
  VisitRow,
  VisitWithNames,
} from '../types/visits.types';

const activeFilter = isNull(scheduledVisits.deletedAt);

// Display name for chips/history: first name + paternal surname (rows that
// predate the surname split carry their full name in `name`).
const displayName = (name: string | null, paternalLastName: string | null): string | null =>
  name ? [name, paternalLastName].filter(Boolean).join(' ') : null;

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

export const listVisitAssignments = async (db: Db, visitId: string): Promise<AssignmentEntry[]> => {
  const fromTech = alias(users, 'from_tech');
  const toTech = alias(users, 'to_tech');
  const assignor = alias(users, 'assignor');
  const rows = await db
    .select({
      entry: visitAssignments,
      fromName: fromTech.name,
      fromPaternal: fromTech.paternalLastName,
      toName: toTech.name,
      toPaternal: toTech.paternalLastName,
      byName: assignor.name,
      byPaternal: assignor.paternalLastName,
    })
    .from(visitAssignments)
    .leftJoin(fromTech, eq(visitAssignments.fromTechnicianId, fromTech.id))
    .leftJoin(toTech, eq(visitAssignments.toTechnicianId, toTech.id))
    .leftJoin(assignor, eq(visitAssignments.assignedBy, assignor.id))
    .where(eq(visitAssignments.visitId, visitId))
    .orderBy(asc(visitAssignments.createdAt));
  return rows.map((r) => ({
    ...r.entry,
    fromTechnicianName: displayName(r.fromName, r.fromPaternal),
    toTechnicianName: displayName(r.toName, r.toPaternal),
    assignedByName: displayName(r.byName, r.byPaternal),
  }));
};

// Insert + seed the assignment trail in ONE transaction when the visit is born
// assigned, so the current technician is always the latest entry's target.
export const insertVisit = async (db: Db, values: NewVisit): Promise<VisitRow> =>
  db.transaction(async (tx) => {
    const [visit] = await tx.insert(scheduledVisits).values(values).returning();
    if (!visit) throw new Error('insertVisit returned no row');
    if (visit.technicianId) {
      await tx.insert(visitAssignments).values({
        visitId: visit.id,
        fromTechnicianId: null,
        toTechnicianId: visit.technicianId,
        assignedBy: visit.createdBy,
      });
    }
    return visit;
  });

export const updateVisit = async (
  db: Db,
  id: string,
  fields: UpdateVisitFields,
): Promise<VisitRow | null> => {
  const [row] = await db
    .update(scheduledVisits)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(scheduledVisits.id, id), activeFilter))
    .returning();
  return row ?? null;
};

// Reassign + append the audit entry atomically — the only path that mutates
// technician_id after birth.
export const reassignVisit = async (
  db: Db,
  id: string,
  fromTechnicianId: string | null,
  toTechnicianId: string | null,
  assignedBy: string,
): Promise<VisitRow | null> =>
  db.transaction(async (tx) => {
    const [visit] = await tx
      .update(scheduledVisits)
      .set({ technicianId: toTechnicianId, updatedAt: new Date() })
      .where(and(eq(scheduledVisits.id, id), activeFilter))
      .returning();
    if (!visit) return null;
    await tx.insert(visitAssignments).values({
      visitId: id,
      fromTechnicianId,
      toTechnicianId,
      assignedBy,
    });
    return visit;
  });

export const updateVisitStatus = async (
  db: Db,
  id: string,
  status: VisitStatus,
  statusReason: string | null,
): Promise<VisitRow | null> => {
  const [row] = await db
    .update(scheduledVisits)
    .set({ status, statusReason, updatedAt: new Date() })
    .where(and(eq(scheduledVisits.id, id), activeFilter))
    .returning();
  return row ?? null;
};

// Reschedule = close the original (rescheduled, reason) + open a fresh scheduled
// record carrying the chain link, in ONE transaction. The replacement inherits
// the order/customer/title/notes; a technician change seeds its assignment trail.
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
    if (fields.technicianId) {
      await tx.insert(visitAssignments).values({
        visitId: visit.id,
        fromTechnicianId: null,
        toTechnicianId: fields.technicianId,
        assignedBy: fields.actorId,
      });
    }
    return { closed, visit };
  });
