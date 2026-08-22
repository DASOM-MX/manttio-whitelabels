import { asc, desc, eq, like } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
import { movementReasonDefs } from '../models/movement-reason-defs.model';
import type { NewMovementReason, UpdateMovementReasonFields } from '../types/movement-reasons.types';

// Reason definitions (10-wms/02 §5). There is no delete helper here and never
// will be: `movements.reason` FKs `code`, so a removed reason would orphan
// history. Retirement is `active: false`.

/** Everything, active and inactive: selects filter for themselves, and history
 *  has to render the label of a reason that was retired years ago. Built-ins
 *  lead so the familiar list stays on top; custom reasons follow alphabetically. */
export const listMovementReasons = async (db: Db) =>
  db
    .select()
    .from(movementReasonDefs)
    .orderBy(desc(movementReasonDefs.builtIn), asc(movementReasonDefs.label));

export const findMovementReasonById = async (db: Db, id: string) => {
  const [row] = await db
    .select()
    .from(movementReasonDefs)
    .where(eq(movementReasonDefs.id, id))
    .limit(1);
  return row ?? null;
};

/** By `code`, which is what a movement body sends and what the journal stores. */
export const findMovementReasonByCode = async (db: DbOrTx, code: string) => {
  const [row] = await db
    .select()
    .from(movementReasonDefs)
    .where(eq(movementReasonDefs.code, code))
    .limit(1);
  return row ?? null;
};

/** Every code that could collide with `base` — `base`, `base-2`, `base-3`, …
 *  The slugger reads this to pick the next free suffix. */
export const listCodesLike = async (db: Db, base: string) => {
  const rows = await db
    .select({ code: movementReasonDefs.code })
    .from(movementReasonDefs)
    .where(like(movementReasonDefs.code, `${base}%`));
  return rows.map((r) => r.code);
};

export const insertMovementReason = async (db: Db, values: NewMovementReason) => {
  const [row] = await db.insert(movementReasonDefs).values(values).returning();
  if (!row) throw new Error('insert movement_reason_defs returned no row');
  return row;
};

export const updateMovementReasonRow = async (
  db: Db,
  id: string,
  fields: UpdateMovementReasonFields,
) => {
  const [row] = await db
    .update(movementReasonDefs)
    .set(fields)
    .where(eq(movementReasonDefs.id, id))
    .returning();
  return row ?? null;
};
