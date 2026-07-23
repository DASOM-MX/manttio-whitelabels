import { and, asc, eq, gte, isNull, lt } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Db } from '../../database/client';
import { scheduledVisits, visitAssignments } from '../models/visits.model';
import { customers } from '../../customers/models/customers.model';
import { users } from '../../users/models/users.model';
import type { VisitStatus } from '../enums/visits.enum';
import type {
  AssignmentEntry,
  NewVisit,
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
): Promise<VisitRow | null> => {
  const [row] = await db
    .update(scheduledVisits)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(scheduledVisits.id, id), activeFilter))
    .returning();
  return row ?? null;
};
