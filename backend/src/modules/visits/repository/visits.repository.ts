import { and, asc, eq, gte, inArray, isNull, lte, type SQL } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
import { scheduledVisits, visitEquipment } from '../models/visits.model';
import { customers } from '../../customers/models/customers.model';
import { users } from '../../users/models/users.model';
import { equipment } from '../../equipment/models/equipment.model';
import { serviceOrders } from '../../service-orders/models/service-orders.model';
import { VisitStatus } from '../enums/visits.enum';
import type {
  CorrectVisitFields,
  NewVisit,
  VisitEquipmentLink,
  VisitLifecycleFields,
  VisitRow,
  VisitWithMeta,
} from '../types/visits.types';

const activeFilter = isNull(scheduledVisits.deletedAt);

// The three joined labels every chip renders. Selected together so the week
// view costs one query rather than one per visit.
const metaColumns = {
  row: scheduledVisits,
  customerName: customers.name,
  technicianName: users.name,
  serviceOrderFolio: serviceOrders.folio,
};

/** The calendar's range read (12 §5). Bounded by `from`/`to` and sorted the way
 *  the week grid stacks chips, so the frontend never re-sorts. Joins the two
 *  display names the chip needs — one query per week, not one per visit. */
export const listVisitsInRange = async (
  db: Db,
  filters: {
    from: Date;
    to: Date;
    technicianId?: string;
    unassigned?: boolean;
    customerId?: string;
    status?: VisitStatus;
  },
): Promise<VisitWithMeta[]> => {
  const conds: SQL[] = [
    activeFilter,
    // A visit is in range when it *starts* in it. Deliberately not an overlap
    // test: `scheduledEnd` is optional, so an overlap rule would silently treat
    // open-ended visits differently from timed ones.
    gte(scheduledVisits.scheduledStart, filters.from),
    lte(scheduledVisits.scheduledStart, filters.to),
  ];
  if (filters.unassigned) conds.push(isNull(scheduledVisits.technicianId));
  else if (filters.technicianId) conds.push(eq(scheduledVisits.technicianId, filters.technicianId));
  if (filters.customerId) conds.push(eq(scheduledVisits.customerId, filters.customerId));
  if (filters.status) conds.push(eq(scheduledVisits.status, filters.status));

  const rows = await db
    .select(metaColumns)
    .from(scheduledVisits)
    .leftJoin(customers, eq(customers.id, scheduledVisits.customerId))
    .leftJoin(users, eq(users.id, scheduledVisits.technicianId))
    .leftJoin(serviceOrders, eq(serviceOrders.id, scheduledVisits.serviceOrderId))
    .where(and(...conds))
    .orderBy(asc(scheduledVisits.scheduledStart), asc(scheduledVisits.createdAt));
  return rows;
};

export const findVisitById = async (db: DbOrTx, id: string): Promise<VisitRow | null> => {
  const [row] = await db
    .select()
    .from(scheduledVisits)
    .where(and(eq(scheduledVisits.id, id), activeFilter))
    .limit(1);
  return row ?? null;
};

export const findVisitWithMeta = async (db: Db, id: string): Promise<VisitWithMeta | null> => {
  const [row] = await db
    .select(metaColumns)
    .from(scheduledVisits)
    .leftJoin(customers, eq(customers.id, scheduledVisits.customerId))
    .leftJoin(users, eq(users.id, scheduledVisits.technicianId))
    .leftJoin(serviceOrders, eq(serviceOrders.id, scheduledVisits.serviceOrderId))
    .where(and(eq(scheduledVisits.id, id), activeFilter))
    .limit(1);
  return row ?? null;
};

/** The successor minted from this closed visit, if one exists. Derived on the
 *  single-visit read only — the week list would pay a join per row for a link
 *  the chips don't render. */
export const findSuccessorId = async (
  db: DbOrTx,
  visitId: string,
): Promise<string | null> => {
  const [row] = await db
    .select({ id: scheduledVisits.id })
    .from(scheduledVisits)
    .where(and(eq(scheduledVisits.rescheduledFromId, visitId), activeFilter))
    .limit(1);
  return row?.id ?? null;
};

/** The units linked to a visit, in a stable order. */
export const equipmentForVisit = async (
  db: DbOrTx,
  visitId: string,
): Promise<VisitEquipmentLink[]> =>
  db
    .select({ id: equipment.id, name: equipment.name })
    .from(visitEquipment)
    .innerJoin(equipment, eq(equipment.id, visitEquipment.equipmentId))
    .where(eq(visitEquipment.visitId, visitId))
    .orderBy(asc(equipment.name));

/** Which of these equipment ids actually belong to the customer. The service
 *  diffs this against what was asked for, so the error can name the offenders. */
export const equipmentIdsForCustomer = async (
  db: Db,
  customerId: string,
  ids: string[],
): Promise<string[]> => {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: equipment.id })
    .from(equipment)
    .where(
      and(
        inArray(equipment.id, ids),
        eq(equipment.customerId, customerId),
        isNull(equipment.deletedAt),
      ),
    );
  return rows.map((r) => r.id);
};

/** Insert the visit and its equipment links atomically, running `audit` inside
 *  the same transaction — the trail can never drift from the row it describes
 *  (19 §7). Returns the created row; the service composes the DTO. */
export const insertVisit = async (
  db: Db,
  values: NewVisit,
  equipmentIds: string[],
  audit: (tx: DbOrTx, visit: VisitRow) => Promise<void>,
): Promise<VisitRow> =>
  db.transaction(async (tx) => {
    const [visit] = await tx.insert(scheduledVisits).values(values).returning();
    if (!visit) throw new Error('insertVisit returned no row');
    if (equipmentIds.length) {
      await tx
        .insert(visitEquipment)
        .values(equipmentIds.map((equipmentId) => ({ visitId: visit.id, equipmentId })));
    }
    await audit(tx, visit);
    return visit;
  });

/** The single write path for every mutation after creation — correction,
 *  reassignment, respond and close all funnel through here so none of them can
 *  skip the audit append or the open-state guard.
 *
 *  `guardStatus` re-checks the state **inside** the transaction: the service
 *  already read the row, but between that read and this write another request
 *  could have closed it. The `where` makes the update itself the guard, so the
 *  loser of a race gets no row back rather than clobbering a terminal record. */
export const updateVisit = async (
  db: Db,
  id: string,
  fields: CorrectVisitFields & VisitLifecycleFields,
  guardStatus: VisitStatus,
  audit: (tx: DbOrTx, visit: VisitRow) => Promise<void>,
): Promise<VisitRow | null> =>
  db.transaction(async (tx) => {
    const [visit] = await tx
      .update(scheduledVisits)
      .set({ ...fields, updatedAt: new Date() })
      .where(
        and(eq(scheduledVisits.id, id), eq(scheduledVisits.status, guardStatus), activeFilter),
      )
      .returning();
    if (!visit) return null;
    await audit(tx, visit);
    return visit;
  });

/** Mint the successor of a closed visit, copying its equipment links. The
 *  parent's `closed` state is re-asserted inside the transaction for the same
 *  race reason as `updateVisit`; the one-successor rule is enforced by the
 *  unique index, which surfaces as a unique violation the service translates. */
export const insertRescheduledVisit = async (
  db: Db,
  sourceId: string,
  values: NewVisit,
  audit: (tx: DbOrTx, visit: VisitRow) => Promise<void>,
): Promise<VisitRow | null> =>
  db.transaction(async (tx) => {
    const [source] = await tx
      .select({ id: scheduledVisits.id })
      .from(scheduledVisits)
      .where(
        and(
          eq(scheduledVisits.id, sourceId),
          eq(scheduledVisits.status, VisitStatus.Closed),
          activeFilter,
        ),
      )
      .limit(1);
    if (!source) return null;

    const [visit] = await tx.insert(scheduledVisits).values(values).returning();
    if (!visit) throw new Error('insertRescheduledVisit returned no row');

    // The successor covers the same units as the visit it replaces — it is the
    // same job on a new date, not a new scope.
    const links = await tx
      .select({ equipmentId: visitEquipment.equipmentId })
      .from(visitEquipment)
      .where(eq(visitEquipment.visitId, sourceId));
    if (links.length) {
      await tx
        .insert(visitEquipment)
        .values(links.map((l) => ({ visitId: visit.id, equipmentId: l.equipmentId })));
    }
    await audit(tx, visit);
    return visit;
  });
