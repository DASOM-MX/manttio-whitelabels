import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customerInteractions } from '../models/customer-interactions.model';
import { users } from '../../users/models/users.model';
import type { InteractionDTO, InteractionRow, NewInteraction } from '../types/interactions.types';

// Row shape after the users left-join (author name folded in).
type RowWithAuthor = InteractionRow & { userName: string | null };

const toDTO = (row: RowWithAuthor): InteractionDTO => ({
  id: row.id,
  customerId: row.customerId,
  type: row.type,
  body: row.body,
  ref: row.refKind && row.refId ? { kind: row.refKind, id: row.refId } : undefined,
  userId: row.userId,
  userName: row.userName ?? undefined,
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
};

/** Paged, newest-first timeline for one customer (08 §2). */
export const listInteractions = async (
  db: Db,
  customerId: string,
  page: number,
  limit: number,
): Promise<{ items: InteractionDTO[]; total: number }> => {
  const rows = await db
    .select(authoredColumns)
    .from(customerInteractions)
    .leftJoin(users, eq(customerInteractions.userId, users.id))
    .where(eq(customerInteractions.customerId, customerId))
    .orderBy(desc(customerInteractions.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(customerInteractions)
    .where(eq(customerInteractions.customerId, customerId));

  return { items: rows.map(toDTO), total: countRows[0]?.count ?? 0 };
};

/** Append one entry and return it with the author name resolved. */
export const insertInteraction = async (
  db: Db,
  values: NewInteraction,
): Promise<InteractionDTO> => {
  const [row] = await db.insert(customerInteractions).values(values).returning();
  if (!row) throw new Error('insertInteraction returned no row');
  let userName: string | null = null;
  if (row.userId) {
    const [author] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, row.userId))
      .limit(1);
    userName = author?.name ?? null;
  }
  return toDTO({ ...row, userName });
};
