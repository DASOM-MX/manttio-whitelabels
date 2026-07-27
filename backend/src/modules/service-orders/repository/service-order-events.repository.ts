import { asc, eq } from 'drizzle-orm';
import type { Db, DbOrTx } from '../../database/client';
import { users } from '../../users/models/users.model';
import { displayName } from '../../users/utils/display-name';
import { serviceOrderEvents } from '../models/service-order-events.model';
import type {
  NewServiceOrderEvent,
  ServiceOrderEventDTO,
} from '../types/service-orders.types';

/** Append one entry to an order's timeline (19 §7).
 *
 *  Takes `DbOrTx` rather than `Db` on purpose: every writer is supposed to hand
 *  in the transaction of the state change it is describing, so the event and
 *  the change commit or roll back together. Appending from outside a
 *  transaction is legal but should be rare — it's how the trail drifts. */
export const appendOrderEvent = async (
  db: DbOrTx,
  values: NewServiceOrderEvent,
): Promise<void> => {
  await db.insert(serviceOrderEvents).values(values);
};

/** Bulk variant for the create transaction, which opens a timeline with one
 *  `order_created`, an `order_line_added` per line and a `report_exploded` per
 *  unit — a round trip each would be silly. */
export const appendOrderEvents = async (
  db: DbOrTx,
  values: NewServiceOrderEvent[],
): Promise<void> => {
  if (values.length === 0) return;
  await db.insert(serviceOrderEvents).values(values);
};

/** The whole timeline for one order, **oldest-first** (19 §7): this feed reads
 *  as a story, and it becomes the client handoff document, so it runs forwards
 *  — unlike the customer CRM timeline, which is newest-first. Unpaged for the
 *  same reason: a partial history is not an audit trail. */
export const listOrderEvents = async (
  db: Db,
  serviceOrderId: string,
): Promise<ServiceOrderEventDTO[]> => {
  const rows = await db
    .select({
      id: serviceOrderEvents.id,
      type: serviceOrderEvents.type,
      actorId: serviceOrderEvents.actorId,
      refKind: serviceOrderEvents.refKind,
      refId: serviceOrderEvents.refId,
      changes: serviceOrderEvents.changes,
      note: serviceOrderEvents.note,
      createdAt: serviceOrderEvents.createdAt,
      actorName: users.name,
      actorPaternalLastName: users.paternalLastName,
      actorMaternalLastName: users.maternalLastName,
    })
    .from(serviceOrderEvents)
    .leftJoin(users, eq(serviceOrderEvents.actorId, users.id))
    .where(eq(serviceOrderEvents.serviceOrderId, serviceOrderId))
    .orderBy(asc(serviceOrderEvents.createdAt));

  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    actorId: row.actorId ?? undefined,
    actorName:
      displayName({
        name: row.actorName,
        paternalLastName: row.actorPaternalLastName,
        maternalLastName: row.actorMaternalLastName,
      }) || undefined,
    ref: row.refKind && row.refId ? { kind: row.refKind, id: row.refId } : undefined,
    changes: (row.changes as ServiceOrderEventDTO['changes']) ?? undefined,
    note: row.note ?? undefined,
    createdAt: row.createdAt.toISOString(),
  }));
};
