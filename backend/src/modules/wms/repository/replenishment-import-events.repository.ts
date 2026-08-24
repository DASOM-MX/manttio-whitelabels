import { and, count, desc, eq } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
import { users } from '../../users/models/users.model';
import { ImportEventType } from '../enums/replenishment-imports.enum';
import { replenishmentImportEvents } from '../models/replenishment-imports.model';
import type { NewImportEvent } from '../types/replenishment-imports.types';

// The whole-lifecycle audit (10-wms/02 §6, 01 §2). APPEND-ONLY, like
// `movements`: insert and select, no update, no delete — grep-provable. It
// outlives the staged rows on purpose, so "what was submitted, changed,
// rejected and approved" survives the approval that throws the staging away.

/** Always called with the transaction of the change it describes — an audit
 *  row that can commit without its event is not an audit trail. */
export const insertImportEvent = async (tx: DbOrTx, values: NewImportEvent) => {
  const [row] = await tx.insert(replenishmentImportEvents).values(values).returning();
  if (!row) throw new Error('insertImportEvent returned no row');
  return row;
};

export const listImportEventsPaged = async (
  db: Db,
  importId: string,
  page: number,
  limit: number,
) => {
  const where = eq(replenishmentImportEvents.importId, importId);
  const [rows, [totals]] = await Promise.all([
    db
      .select({
        type: replenishmentImportEvents.type,
        line: replenishmentImportEvents.line,
        reason: replenishmentImportEvents.reason,
        details: replenishmentImportEvents.details,
        createdAt: replenishmentImportEvents.createdAt,
        actorId: users.id,
        actorName: users.name,
      })
      .from(replenishmentImportEvents)
      // LEFT: the queue consumer's events have no actor by design.
      .leftJoin(users, eq(users.id, replenishmentImportEvents.actorUserId))
      .where(where)
      .orderBy(desc(replenishmentImportEvents.createdAt), desc(replenishmentImportEvents.id))
      .limit(limit)
      .offset((page - 1) * limit),
    db.select({ total: count() }).from(replenishmentImportEvents).where(where),
  ]);
  return { rows, total: totals?.total ?? 0 };
};

/** The comment from the most recent rejection, surfaced on the status read so
 *  office sees the feedback without loading the whole timeline (02 §6). */
export const findLatestRejectionComment = async (db: Db, importId: string) => {
  const [row] = await db
    .select({ reason: replenishmentImportEvents.reason })
    .from(replenishmentImportEvents)
    .where(
      and(
        eq(replenishmentImportEvents.importId, importId),
        eq(replenishmentImportEvents.type, ImportEventType.Rejected),
      ),
    )
    .orderBy(desc(replenishmentImportEvents.createdAt), desc(replenishmentImportEvents.id))
    .limit(1);
  return row?.reason ?? null;
};
