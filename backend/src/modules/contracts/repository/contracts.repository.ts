import { and, desc, eq, ilike, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
import { customers } from '../../customers/models/customers.model';
import { customerInteractions } from '../../customers/models/customer-interactions.model';
import { InteractionRefKind, InteractionType } from '../../customers/enums/interactions.enum';
import { serviceOrders } from '../../service-orders/models/service-orders.model';
import {
  ServiceOrderEventRefKind,
  ServiceOrderEventType,
} from '../../service-orders/enums/service-orders.enum';
import { appendOrderEvent } from '../../service-orders/repository/service-order-events.repository';
import type { Role } from '../../users/enums/users.enum';
import { contractCounters, contracts } from '../models/contracts.model';
import { ContractValidity } from '../enums/contracts.enum';
import { formatContractFolio } from '../utils/contract-folio';
import type { ContractRow, NewContract, UpdateContractFields } from '../types/contracts.types';
import type { ListContractsQuery } from '../validators/contracts.validator';

const activeFilter = isNull(contracts.deletedAt);

const dayString = (d: Date) => d.toISOString().slice(0, 10);

// A row of the contracts table plus its derived display joins.
export interface ContractMetaRow {
  row: ContractRow;
  customerName: string | null;
  serviceOrderFolio: string | null;
}

const metaColumns = {
  row: contracts,
  customerName: customers.name,
  serviceOrderFolio: serviceOrders.folio,
};

/** Role-scoped read filter (13 §4). Owner and admin see every contract;
 *  office and technician see one only when their role is listed in
 *  `visible_to_roles`. Returns undefined for the manager tier so the caller
 *  adds no condition at all. */
export const visibilityFilter = (role: Role): SQL | undefined => {
  if (role === 'owner' || role === 'admin') return undefined;
  return sql`${contracts.visibleToRoles} @> array[${role}]::text[]`;
};

// Validity is derived, never stored (13 §1) — so filtering on it is a date
// predicate, not a column comparison.
const validityFilter = (validity: ContractValidity): SQL => {
  switch (validity) {
    case ContractValidity.NotStarted:
      return sql`${contracts.validFromDate} > current_date`;
    case ContractValidity.Expired:
      return sql`${contracts.expiryDate} is not null and ${contracts.expiryDate} < current_date`;
    case ContractValidity.Active:
      return sql`${contracts.validFromDate} <= current_date
        and (${contracts.expiryDate} is null or ${contracts.expiryDate} >= current_date)`;
  }
};

const listConditions = (q: ListContractsQuery, role: Role): SQL[] => {
  const conds: SQL[] = [activeFilter];
  const visibility = visibilityFilter(role);
  if (visibility) conds.push(visibility);
  if (q.customerId) conds.push(eq(contracts.customerId, q.customerId));
  if (q.serviceOrderId) conds.push(eq(contracts.serviceOrderId, q.serviceOrderId));
  if (q.type) conds.push(eq(contracts.type, q.type));
  if (q.validity) conds.push(validityFilter(q.validity));
  // Exact containment — this is what the GIN index answers.
  if (q.tag) conds.push(sql`${contracts.tags} @> array[${q.tag}]::text[]`);
  if (q.search) {
    const term = `%${q.search}%`;
    const match = or(
      ilike(contracts.folio, term),
      ilike(contracts.name, term),
      ilike(contracts.description, term),
      ilike(contracts.fileName, term),
      sql`exists (select 1 from unnest(${contracts.tags}) as t(tag) where t.tag ilike ${term})`,
    );
    if (match) conds.push(match);
  }
  return conds;
};

export const listContracts = async (
  db: Db,
  q: ListContractsQuery,
  role: Role,
): Promise<{ items: ContractMetaRow[]; total: number }> => {
  const where = and(...listConditions(q, role));

  const items = await db
    .select(metaColumns)
    .from(contracts)
    .innerJoin(customers, eq(customers.id, contracts.customerId))
    .leftJoin(serviceOrders, eq(serviceOrders.id, contracts.serviceOrderId))
    .where(where)
    .orderBy(desc(contracts.createdAt))
    .limit(q.limit)
    .offset((q.page - 1) * q.limit);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contracts)
    .where(where);

  return { items, total: countRows[0]?.count ?? 0 };
};

/** Read one contract, role-scoped. A contract the caller may not see reads as
 *  absent rather than forbidden — 404 over 403, so the endpoint never confirms
 *  that a restricted document exists (13 §4). */
export const findContractWithMeta = async (
  db: Db,
  id: string,
  role: Role,
): Promise<ContractMetaRow | null> => {
  const conds = [eq(contracts.id, id), activeFilter];
  const visibility = visibilityFilter(role);
  if (visibility) conds.push(visibility);

  const [row] = await db
    .select(metaColumns)
    .from(contracts)
    .innerJoin(customers, eq(customers.id, contracts.customerId))
    .leftJoin(serviceOrders, eq(serviceOrders.id, contracts.serviceOrderId))
    .where(and(...conds))
    .limit(1);
  return row ?? null;
};

/** Append the contract's audit entry to the **customer's** timeline (13 §3).
 *  The client is the always-present anchor, so this works for order-generated
 *  and standalone contracts alike and there is no per-contract audit table. */
const appendContractInteraction = async (
  tx: DbOrTx,
  args: { customerId: string; contractId: string; body: string; actorId: string },
): Promise<void> => {
  await tx.insert(customerInteractions).values({
    customerId: args.customerId,
    type: InteractionType.System,
    body: args.body,
    refKind: InteractionRefKind.Contract,
    refId: args.contractId,
    userId: args.actorId,
  });
};

export interface InsertContractInput extends Omit<NewContract, 'folio'> {
  customerId: string;
  createdBy: string;
}

/** Create in one transaction (13 §1): allocate the daily folio, insert the row,
 *  and write both audit trails — so a contract can never exist without its
 *  timeline entry, nor burn a folio it didn't use. */
export const insertContract = async (
  db: Db,
  values: InsertContractInput,
  day: Date,
): Promise<ContractRow> =>
  db.transaction(async (tx) => {
    const [counter] = await tx
      .insert(contractCounters)
      .values({ day: dayString(day), lastNumber: 1 })
      .onConflictDoUpdate({
        target: contractCounters.day,
        set: { lastNumber: sql`${contractCounters.lastNumber} + 1` },
      })
      .returning({ lastNumber: contractCounters.lastNumber });
    if (!counter) throw new Error('insertContract: counter upsert returned no row');

    const [row] = await tx
      .insert(contracts)
      .values({ ...values, folio: formatContractFolio(day, counter.lastNumber) })
      .returning();
    if (!row) throw new Error('insertContract returned no row');

    await appendContractInteraction(tx, {
      customerId: row.customerId,
      contractId: row.id,
      body: `Contrato ${row.folio} creado — ${row.name}`,
      actorId: values.createdBy,
    });

    // Order-generated contracts additionally open a line on the *job's*
    // timeline (19 §7) — complementary to the client entry above, not a
    // duplicate of it.
    if (row.serviceOrderId) {
      await appendOrderEvent(tx, {
        serviceOrderId: row.serviceOrderId,
        type: ServiceOrderEventType.OrderContractGenerated,
        actorId: values.createdBy,
        refKind: ServiceOrderEventRefKind.Contract,
        refId: row.id,
        note: `${row.folio} — ${row.name}`,
      });
    }

    return row;
  });

export const updateContract = async (
  db: Db,
  id: string,
  fields: UpdateContractFields,
  audit: { body: string; actorId: string },
): Promise<ContractRow | null> =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .update(contracts)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(contracts.id, id), activeFilter))
      .returning();
    if (!row) return null;

    await appendContractInteraction(tx, {
      customerId: row.customerId,
      contractId: row.id,
      body: audit.body,
      actorId: audit.actorId,
    });
    return row;
  });

export const softDeleteContract = async (
  db: Db,
  id: string,
  deleteComment: string,
  deletedBy: string,
): Promise<{ id: string } | null> =>
  db.transaction(async (tx) => {
    const now = new Date();
    const [row] = await tx
      .update(contracts)
      .set({ deletedAt: now, updatedAt: now, deleteComment, deletedBy })
      .where(and(eq(contracts.id, id), activeFilter))
      .returning();
    if (!row) return null;

    await appendContractInteraction(tx, {
      customerId: row.customerId,
      contractId: row.id,
      body: `Contrato ${row.folio} eliminado — ${deleteComment}`,
      actorId: deletedBy,
    });
    return { id: row.id };
  });

/** The download path (13 §1.2): resolve the private object key, role-scoped.
 *  Kept separate from the DTO read because `fileKey` must never reach a
 *  response body. */
export const findContractFile = async (
  db: Db,
  id: string,
  role: Role,
): Promise<Pick<ContractRow, 'fileKey' | 'fileName' | 'fileMime'> | null> => {
  const conds = [eq(contracts.id, id), activeFilter];
  const visibility = visibilityFilter(role);
  if (visibility) conds.push(visibility);

  const [row] = await db
    .select({
      fileKey: contracts.fileKey,
      fileName: contracts.fileName,
      fileMime: contracts.fileMime,
    })
    .from(contracts)
    .where(and(...conds))
    .limit(1);
  return row ?? null;
};
