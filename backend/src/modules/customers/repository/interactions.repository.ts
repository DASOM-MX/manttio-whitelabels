import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customerInteractions } from '../models/customer-interactions.model';
import { customers } from '../models/customers.model';
import { users } from '../../users/models/users.model';
import { displayName } from '../../users/utils/display-name';
import { InteractionRefKind, InteractionType } from '../enums/interactions.enum';
import type {
  InteractionDTO,
  InteractionRowWithAuthor,
  NewInteraction,
  RecentInteractionDTO,
} from '../types/interactions.types';

const toDTO = (row: InteractionRowWithAuthor): InteractionDTO => ({
  id: row.id,
  customerId: row.customerId,
  type: row.type,
  body: row.body,
  ref: row.refKind && row.refId ? { kind: row.refKind, id: row.refId } : undefined,
  userId: row.userId,
  userName:
    displayName({
      name: row.userName,
      paternalLastName: row.userPaternalLastName,
      maternalLastName: row.userMaternalLastName,
    }) || undefined,
  createdAt: row.createdAt,
});

const authoredColumns = {
  id: customerInteractions.id,
  customerId: customerInteractions.customerId,
  type: customerInteractions.type,
  body: customerInteractions.body,
  refKind: customerInteractions.refKind,
  refId: customerInteractions.refId,
  userId: customerInteractions.userId,
  createdAt: customerInteractions.createdAt,
  userName: users.name,
  userPaternalLastName: users.paternalLastName,
  userMaternalLastName: users.maternalLastName,
};

/** Paged, newest-first timeline for one customer (08 §2), optionally narrowed
 *  to what one linked entity wrote (`refKind`/`refId`) — the read an entity's
 *  own audit card makes (13 §6). `total` counts the same filtered set, so
 *  "cargar más" and the count agree. */
export const listInteractions = async (
  db: Db,
  customerId: string,
  page: number,
  limit: number,
  ref: { refKind?: InteractionRefKind; refId?: string } = {},
): Promise<{ items: InteractionDTO[]; total: number }> => {
  const conds = [eq(customerInteractions.customerId, customerId)];
  if (ref.refKind) conds.push(eq(customerInteractions.refKind, ref.refKind));
  if (ref.refId) conds.push(eq(customerInteractions.refId, ref.refId));
  const where = and(...conds);

  const rows = await db
    .select(authoredColumns)
    .from(customerInteractions)
    .leftJoin(users, eq(customerInteractions.userId, users.id))
    .where(where)
    .orderBy(desc(customerInteractions.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customerInteractions)
    .where(where);

  return { items: rows.map(toDTO), total: countRows[0]?.count ?? 0 };
};

/** Tenant-wide latest activity across all customers (utm-params 03): newest
 *  first. Timelines of soft-deleted customers stay stored but leave the feed
 *  with their customer. */
export const listRecentInteractions = async (
  db: Db,
  limit: number,
): Promise<RecentInteractionDTO[]> => {
  const rows = await db
    .select({ ...authoredColumns, customerName: customers.name, customerStatus: customers.status })
    .from(customerInteractions)
    .leftJoin(users, eq(customerInteractions.userId, users.id))
    .innerJoin(customers, eq(customerInteractions.customerId, customers.id))
    .where(isNull(customers.deletedAt))
    .orderBy(desc(customerInteractions.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    ...toDTO(row),
    customerName: row.customerName,
    customerStatus: row.customerStatus,
  }));
};

/** Append a backend-generated `system` entry that a report reaching `finished`
 *  produces (08 §2 — the trail's "service performed" record, linking out to the
 *  report). Best-effort from the reports flow; never blocks the report write. */
export const emitServicePerformed = async (
  db: Db,
  input: { customerId: string; reportId: string; userId: string | null; body: string },
): Promise<void> => {
  await db.insert(customerInteractions).values({
    customerId: input.customerId,
    type: InteractionType.System,
    body: input.body,
    refKind: InteractionRefKind.Report,
    refId: input.reportId,
    userId: input.userId,
  });
};

/** Append one entry and return it with the author name resolved. */
export const insertInteraction = async (
  db: Db,
  values: NewInteraction,
): Promise<InteractionDTO> => {
  const [row] = await db.insert(customerInteractions).values(values).returning();
  if (!row) throw new Error('insertInteraction returned no row');
  let author: {
    name: string;
    paternalLastName: string | null;
    maternalLastName: string | null;
  } | null = null;
  if (row.userId) {
    const [found] = await db
      .select({
        name: users.name,
        paternalLastName: users.paternalLastName,
        maternalLastName: users.maternalLastName,
      })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    author = found ?? null;
  }
  return toDTO({
    ...row,
    userName: author?.name ?? null,
    userPaternalLastName: author?.paternalLastName ?? null,
    userMaternalLastName: author?.maternalLastName ?? null,
  });
};
