import { and, asc, eq, gte, inArray, isNull, like, lte, sql, type SQL } from 'drizzle-orm';
import type { Db, DbOrTx, Tx } from '../../database/client';
import { scheduledVisits, visitCounters, visitEquipment } from '../models/visits.model';
import { formatVisitCode } from '../utils/visit-code';
import { customers } from '../../customers/models/customers.model';
import { users } from '../../users/models/users.model';
import { equipment } from '../../equipment/models/equipment.model';
import { serviceOrders } from '../../service-orders/models/service-orders.model';
import { VisitStatus } from '../enums/visits.enum';
import type {
  CorrectVisitFields,
  NewVisitFields,
  VisitEquipmentLink,
  VisitLifecycleFields,
  VisitRow,
  VisitWithMeta,
} from '../types/visits.types';

const activeFilter = isNull(scheduledVisits.deletedAt);

const dayString = (d: Date) => d.toISOString().slice(0, 10);

/** Reserve the next code for `day` and format it. Runs on the caller's
 *  transaction so the number and the row it belongs to commit together — a
 *  counter bumped outside the transaction would burn codes on every rollback.
 *
 *  The upsert-and-read-back is what makes it concurrency-safe: the row is locked
 *  for the rest of the transaction, so a second booking blocks rather than
 *  reading the same `lastNumber`. */
const nextVisitCode = async (tx: Tx, day: Date): Promise<string> => {
  const [counter] = await tx
    .insert(visitCounters)
    .values({ day: dayString(day), lastNumber: 1 })
    .onConflictDoUpdate({
      target: visitCounters.day,
      set: { lastNumber: sql`${visitCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: visitCounters.lastNumber });
  if (!counter) throw new Error('nextVisitCode: counter upsert returned no row');
  return formatVisitCode(day, counter.lastNumber);
};

// The joined labels every chip renders. Selected together so the week view
// costs one query rather than one per visit. Priority rides along because the
// calendar marks urgent work on the block itself (owner 2026-08-04) — and a
// visit inherits urgency from the order it serves, it has none of its own.
const metaColumns = {
  row: scheduledVisits,
  customerName: customers.name,
  // The field app's visit card names where the job is (12 §4) — a technician
  // navigates to the address, so it rides the same join as the name.
  customerAddress: customers.address,
  technicianName: users.name,
  serviceOrderFolio: serviceOrders.folio,
  serviceOrderPriority: serviceOrders.priority,
};

/** The calendar's range read (12 §5). Bounded by `from`/`to` and sorted the way
 *  the week grid stacks chips, so the frontend never re-sorts. Joins the two
 *  display names the chip needs — one query per week, not one per visit. */
export const listVisitsInRange = async (
  db: Db,
  filters: {
    from?: Date;
    to?: Date;
    internalCode?: string;
    technicianId?: string;
    unassigned?: boolean;
    customerId?: string;
    status?: VisitStatus;
  },
): Promise<VisitWithMeta[]> => {
  const conds: SQL[] = [activeFilter];
  // A visit is in range when it *starts* in it. Deliberately not an overlap
  // test: an overlap rule would treat the (still nullable) `scheduledEnd`
  // differently from a derived one, and the range is a calendar viewport, not a
  // query about coverage.
  //
  // The bounds are optional **only** because a code lookup replaces them: the
  // validator requires either a range or a code, so there is still no way to
  // ask for an unbounded scan (12 §5).
  if (filters.from) conds.push(gte(scheduledVisits.scheduledStart, filters.from));
  if (filters.to) conds.push(lte(scheduledVisits.scheduledStart, filters.to));
  // Prefix match, not `%fragment%` (owner 2026-08-02): `V-2026` narrows to a
  // year, `V-20260802` to a day, a full code finds the one visit.
  //
  // `like`, **not** `ilike`: only case-sensitive LIKE gets a prefix seek out of
  // `scheduled_visits_internal_code_uidx`. Verified on this database
  // (`C.UTF-8`, so the default opclass is enough) —
  //   like  → Index Only Scan, Index Cond: code >= 'V-2026' AND code < 'V-2027'
  //   ilike → full index scan, no Index Cond, ~180× the cost
  // The validator upper-cases the term, so case-sensitivity costs the caller
  // nothing and the index actually does the narrowing it exists for.
  //
  // The term is also restricted there to the code alphabet: `%` and `_` are LIKE
  // wildcards, and `internalCode=%` would otherwise return every visit ever —
  // straight through the "no unbounded scan" rule this filter helps enforce.
  if (filters.internalCode) {
    conds.push(like(scheduledVisits.internalCode, `${filters.internalCode}%`));
  }
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

/** The same links for a whole page of visits, in **one** query, grouped by
 *  visit. The list read is unpaginated by design (a calendar viewport, or a code
 *  prefix), so asking per visit is a round trip per chip — hundreds for a week,
 *  and unbounded for a `V-2026` prefix. Visits with no linked unit are simply
 *  absent from the map; callers default to `[]`. */
export const equipmentForVisits = async (
  db: Db,
  visitIds: string[],
): Promise<Map<string, VisitEquipmentLink[]>> => {
  const grouped = new Map<string, VisitEquipmentLink[]>();
  if (!visitIds.length) return grouped;
  const rows = await db
    .select({ visitId: visitEquipment.visitId, id: equipment.id, name: equipment.name })
    .from(visitEquipment)
    .innerJoin(equipment, eq(equipment.id, visitEquipment.equipmentId))
    .where(inArray(visitEquipment.visitId, visitIds))
    .orderBy(asc(equipment.name));
  for (const { visitId, id, name } of rows) {
    const links = grouped.get(visitId);
    if (links) links.push({ id, name });
    else grouped.set(visitId, [{ id, name }]);
  }
  return grouped;
};

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
  values: NewVisitFields,
  equipmentIds: string[],
  audit: (tx: DbOrTx, visit: VisitRow) => Promise<void>,
): Promise<VisitRow> =>
  db.transaction(async (tx) => {
    // The code is minted here rather than by the service: it must come from the
    // same transaction as the row, and nothing above this layer should be able
    // to author one.
    const internalCode = await nextVisitCode(tx, new Date());
    const [visit] = await tx
      .insert(scheduledVisits)
      .values({ ...values, internalCode })
      .returning();
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
 *  reassignment, start, respond, close and the actuals correction all funnel
 *  through here so none of them can skip the audit append or the state guard.
 *
 *  `guardStatuses` re-checks the state **inside** the transaction: the service
 *  already read the row, but between that read and this write another request
 *  could have moved it on. The `where` makes the update itself the guard, so the
 *  loser of a race gets no row back rather than clobbering a record that has
 *  since changed state.
 *
 *  It takes a **list** rather than a single status because the states each
 *  endpoint accepts stopped being singletons when `in_progress` landed (12 §1,
 *  2026-07-31): reassign/respond/close accept either open state, and the actuals
 *  correction accepts either terminal one. */
export const updateVisit = async (
  db: Db,
  id: string,
  fields: CorrectVisitFields & VisitLifecycleFields,
  guardStatuses: VisitStatus[],
  audit: (tx: DbOrTx, visit: VisitRow) => Promise<void>,
  // Full replacement set for the visit's equipment links, applied inside the
  // same transaction (a correction, owner 2026-08-06). Deleting `visit_
  // equipment` rows does not breach the no-hard-delete rule: they are pure
  // associations, not domain entities, and the before/after sets land in the
  // audit entry this same transaction appends.
  replaceEquipmentIds?: string[],
): Promise<VisitRow | null> =>
  db.transaction(async (tx) => {
    const [visit] = await tx
      .update(scheduledVisits)
      .set({ ...fields, updatedAt: new Date() })
      .where(
        and(
          eq(scheduledVisits.id, id),
          inArray(scheduledVisits.status, guardStatuses),
          activeFilter,
        ),
      )
      .returning();
    if (!visit) return null;
    if (replaceEquipmentIds) {
      await tx.delete(visitEquipment).where(eq(visitEquipment.visitId, id));
      if (replaceEquipmentIds.length) {
        await tx
          .insert(visitEquipment)
          .values(replaceEquipmentIds.map((equipmentId) => ({ visitId: id, equipmentId })));
      }
    }
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
  values: NewVisitFields,
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

    // The successor is a new visit, so it gets its own code — the chain is
    // readable through `rescheduledFromId`, never by reusing an identifier.
    const internalCode = await nextVisitCode(tx, new Date());
    const [visit] = await tx
      .insert(scheduledVisits)
      .values({ ...values, internalCode })
      .returning();
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
