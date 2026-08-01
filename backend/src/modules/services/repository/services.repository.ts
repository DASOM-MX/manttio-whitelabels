import { and, asc, eq, ilike, inArray, isNull, or } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { services } from '../models/services.model';
import { serviceEvents } from '../models/service-events.model';
import { users } from '../../users/models/users.model';
import { ServiceEventType } from '../enums/services.enum';
import type {
  NewService,
  NewServiceEvent,
  PublicServiceRow,
  ServiceEventDraft,
  ServiceEventRow,
  ServiceRow,
  UpdateServiceFields,
} from '../types/services.types';

// Anything that can run a query: the pool client, or a transaction handle.
// Event appends only ever happen inside the transaction of the mutation they
// describe (18 §6.1), so the runner is always a tx today — the alias keeps the
// signature honest about what it needs rather than what it happens to get.
type QueryRunner = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

const activeFilter = isNull(services.deletedAt);

/** Append-only, and the only way events are ever written — there is no update
 *  or delete counterpart anywhere in this module by design (18 §6.1). Always
 *  an array and always **one** multi-row INSERT: a CSV import (CP-6) writes
 *  one `service_created` per row, and awaiting them one at a time would be
 *  that many sequential round trips to Neon inside the import transaction. */
export const appendServiceEvents = async (
  runner: QueryRunner,
  events: NewServiceEvent[],
): Promise<void> => {
  if (events.length === 0) return;
  await runner.insert(serviceEvents).values(events);
};

/** The whole active catalog, name-sorted. No pagination — a service catalog is
 *  tens of rows, and every picker wants all of them (18 §4). */
export const listServices = async (db: Db, filters: { search?: string }): Promise<ServiceRow[]> => {
  const conds = [activeFilter];
  if (filters.search) {
    const q = `%${filters.search}%`;
    // The catalog code is searchable too — a unique code is exactly what
    // people paste in to find one service.
    const match = or(
      ilike(services.name, q),
      ilike(services.description, q),
      ilike(services.internalServiceCode, q),
    );
    if (match) conds.push(match);
  }
  return db
    .select()
    .from(services)
    .where(and(...conds))
    .orderBy(asc(services.name));
};

/** The website-listed subset (18 §4, CP-3). Only the columns the public page may
 *  ever see — `cost`, the SAT keys and the delete audit are never selected, so a
 *  future DTO slip can't leak them. `price` ships raw; the service layer drops it
 *  when the service hides its price. */
export const listPublishedServices = async (db: Db): Promise<PublicServiceRow[]> =>
  db
    .select({
      id: services.id,
      name: services.name,
      // `websiteDescription`, never `description` — the latter is internal
      // management copy and must not reach the site (decided 2026-07-25).
      websiteDescription: services.websiteDescription,
      websiteImageKey: services.websiteImageKey,
      uom: services.uom,
      price: services.price,
      isPriceVisibleInWebsite: services.isPriceVisibleInWebsite,
    })
    .from(services)
    .where(and(activeFilter, eq(services.isListableInWebsite, true)))
    .orderBy(asc(services.name));

export const findServiceById = async (db: Db, id: string): Promise<ServiceRow | null> => {
  const [row] = await db
    .select()
    .from(services)
    .where(and(eq(services.id, id), activeFilter))
    .limit(1);
  return row ?? null;
};

/** Bulk catalog lookup, for the snapshot resolution behind quotation (20) and
 *  order (19) lines. One query for a whole line set — resolving a 20-line quote
 *  with `findServiceById` in a loop would be 20 sequential round trips inside
 *  the request. Soft-deleted services are excluded, so a line referencing one
 *  simply comes back missing and the caller rejects it by id. */
export const findServicesByIds = async (db: Db, ids: string[]): Promise<ServiceRow[]> => {
  if (ids.length === 0) return [];
  return db
    .select()
    .from(services)
    .where(and(inArray(services.id, ids), activeFilter));
};

/** `isReportSource` per id, **including soft-deleted services** (19 §2). The
 *  quote path deliberately honors a service dropped from the catalog since the
 *  client accepted it, so the flag has to remain readable for it — otherwise a
 *  since-deleted job would silently stop exploding its reports. */
export const findReportSourceFlags = async (
  db: Db,
  ids: string[],
): Promise<{ id: string; isReportSource: boolean }[]> => {
  if (ids.length === 0) return [];
  return db
    .select({ id: services.id, isReportSource: services.isReportSource })
    .from(services)
    .where(inArray(services.id, ids));
};

/** Atomic create: the row and its `service_created` event, one transaction —
 *  a service can never exist without the first line of its trail (18 §6.1).
 *  The event arrives as a draft because the id doesn't exist until the row
 *  does. */
export const insertService = async (
  db: Db,
  values: NewService,
  event: ServiceEventDraft,
): Promise<ServiceRow> =>
  db.transaction(async (tx) => {
    const [row] = await tx.insert(services).values(values).returning();
    if (!row) throw new Error('insertService returned no row');
    await appendServiceEvents(tx, [{ ...event, serviceId: row.id }]);
    return row;
  });

/** Update + its `service_updated` event, atomically. The caller composes the
 *  per-field diff (business logic); an empty `events` array is a no-op edit —
 *  the row still bumps `updatedAt`, but a trail entry that says "nothing
 *  changed" would be noise, so none is written. */
export const updateService = async (
  db: Db,
  id: string,
  fields: UpdateServiceFields,
  events: ServiceEventDraft[],
): Promise<ServiceRow | null> =>
  db.transaction(async (tx) => {
    const [row] = await tx
      .update(services)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(services.id, id), activeFilter))
      .returning();
    if (!row) return null;
    await appendServiceEvents(
      tx,
      events.map((event) => ({ ...event, serviceId: id })),
    );
    return row;
  });

/** Audited soft delete + its event, atomically. The row, its trail and the
 *  delete comment all stay — every read path drops the service via
 *  `isNull(deletedAt)`, so the timeline simply becomes unreachable through
 *  the API while remaining the record. */
export const softDeleteService = async (
  db: Db,
  id: string,
  deleteComment: string,
  deletedBy: string,
): Promise<{ id: string } | null> =>
  db.transaction(async (tx) => {
    const now = new Date();
    const [row] = await tx
      .update(services)
      .set({ deletedAt: now, updatedAt: now, deleteComment, deletedBy })
      .where(and(eq(services.id, id), activeFilter))
      .returning({ id: services.id });
    if (!row) return null;
    await appendServiceEvents(tx, [
      {
        serviceId: id,
        type: ServiceEventType.Deleted,
        actorId: deletedBy,
        note: deleteComment,
      },
    ]);
    return row;
  });

/** The timeline in **insertion order** (`seq`, never `created_at` — a batch
 *  shares one timestamp), with actor names resolved so the UI renders a
 *  sentence per row without a lookup table. */
export const listServiceEvents = async (
  db: Db,
  serviceId: string,
): Promise<{ event: ServiceEventRow; actorName: string | null }[]> =>
  db
    .select({ event: serviceEvents, actorName: users.name })
    .from(serviceEvents)
    .leftJoin(users, eq(users.id, serviceEvents.actorId))
    .where(eq(serviceEvents.serviceId, serviceId))
    .orderBy(asc(serviceEvents.seq));
