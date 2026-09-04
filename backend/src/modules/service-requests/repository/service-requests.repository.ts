import { and, asc, count, desc, eq, isNull, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { serviceRequests, serviceRequestCounters } from '../models/service-requests.model';
import { serviceRequestEvents } from '../models/service-request-events.model';
import { ServiceRequestStatus, ServiceRequestEventType } from '../enums/service-requests.enum';
import { folioDayKey, formatServiceRequestFolio } from '../utils/service-request-folio';
import type {
  NewServiceRequest,
  NewServiceRequestEvent,
  ServiceRequestEventRow,
  ServiceRequestRow,
  ServiceRequestStatusEventInput,
} from '../types/service-requests.types';
import { softDeleteQuotationsForServiceRequest } from '../../quotations/repository/quotations.repository';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';
import type { ListServiceRequestsQuery } from '../validators/list-service-requests-query.validator';

type QueryRunner = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Append-only: the only way events are ever written — there is no update or delete
 * counterpart anywhere in this module. Always takes an array and always emits one
 * multi-row INSERT.
 */
export const appendEvents = async (
  runner: QueryRunner,
  events: NewServiceRequestEvent[],
): Promise<void> => {
  if (events.length === 0) return;
  await runner.insert(serviceRequestEvents).values(events);
};

/**
 * Folio counter → header → opening events, in one transaction. The insert and its
 * `created` event are atomic.
 */
export const createServiceRequest = async (
  db: Db,
  data: Omit<NewServiceRequest, 'folio' | 'status'>,
  portalUserId: string,
  day: Date = new Date(),
): Promise<ServiceRequestRow> =>
  db.transaction(async (tx) => {
    // Increment folio counter.
    const [counter] = await tx
      .insert(serviceRequestCounters)
      .values({ day: folioDayKey(day), lastNumber: 1 })
      .onConflictDoUpdate({
        target: serviceRequestCounters.day,
        set: { lastNumber: sql`${serviceRequestCounters.lastNumber} + 1` },
      })
      .returning({ lastNumber: serviceRequestCounters.lastNumber });
    if (!counter) throw new Error('createServiceRequest: counter upsert returned no row');

    // Insert the request.
    const [request] = await tx
      .insert(serviceRequests)
      .values({
        ...data,
        folio: formatServiceRequestFolio(day, counter.lastNumber),
        status: ServiceRequestStatus.Submitted,
      })
      .returning();
    if (!request) throw new Error('createServiceRequest: insert returned no row');

    // Append the created event.
    await appendEvents(tx, [
      {
        serviceRequestId: request.id,
        type: ServiceRequestEventType.Created,
        portalUserId,
        changes: { folio: request.folio },
      },
    ]);

    return request;
  });

// Scope + visibility. A withdrawn request is soft-deleted, and `status=cancelled`
// is the single read that reaches those rows: the customer must be able to review
// what they cancelled, but it must not sit in the default list (owner,
// 2026-09-03). Every other filter, and the unfiltered list, hides them.
const listFilters = (customerId: string, q: ListServiceRequestsQuery): SQL => {
  const conds: SQL[] = [eq(serviceRequests.customerId, customerId)];
  if (q.status) conds.push(eq(serviceRequests.status, q.status));
  if (q.status !== ServiceRequestStatus.Cancelled) {
    conds.push(isNull(serviceRequests.deletedAt));
  }
  return and(...conds)!;
};

/**
 * List requests for a customer, newest first, with a real total count.
 * Offset is computed from the query's page/limit.
 */
export const listServiceRequestsForCustomer = async (
  db: Db,
  customerId: string,
  q: ListServiceRequestsQuery,
): Promise<GenericQueryResponse<ServiceRequestRow>> => {
  const where = listFilters(customerId, q);
  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(serviceRequests)
      .where(where)
      .orderBy(desc(serviceRequests.createdAt))
      .limit(q.limit)
      .offset((q.page - 1) * q.limit),
    db.select({ total: count() }).from(serviceRequests).where(where),
  ]);

  const total = totalResult[0]?.total ?? 0;
  return { items: rows, total, page: q.page, limit: q.limit };
};

/**
 * Find a request by ID for a specific customer. Returns null if not found or
 * belongs to a different customer. Scope is enforced in the WHERE clause.
 *
 * Deliberately does NOT filter `deleted_at`: a cancelled request is reachable
 * from the `status=cancelled` list, so its detail page has to open too.
 */
export const findServiceRequestById = async (
  db: Db,
  id: string,
  customerId: string,
): Promise<ServiceRequestRow | null> => {
  const [row] = await db
    .select()
    .from(serviceRequests)
    .where(and(eq(serviceRequests.id, id), eq(serviceRequests.customerId, customerId)));
  return row ?? null;
};

/**
 * List events for a request, in insertion order.
 */
export const listServiceRequestEvents = async (
  db: Db,
  requestId: string,
): Promise<ServiceRequestEventRow[]> => {
  return db
    .select()
    .from(serviceRequestEvents)
    .where(eq(serviceRequestEvents.serviceRequestId, requestId))
    .orderBy(asc(serviceRequestEvents.seq));
};

/**
 * Update status in one transaction with the event append. Scoped to a specific
 * customer — unauthorized access returns null (404 to the caller).
 */
export const updateServiceRequestStatus = async (
  db: Db,
  requestId: string,
  customerId: string,
  newStatus: ServiceRequestStatus,
  eventData: ServiceRequestStatusEventInput,
): Promise<ServiceRequestRow | null> =>
  db.transaction(async (tx) => {
    const [updated] = await tx
      .update(serviceRequests)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(and(eq(serviceRequests.id, requestId), eq(serviceRequests.customerId, customerId)))
      .returning();
    if (!updated) return null;

    // Append the event.
    await appendEvents(tx, [
      {
        serviceRequestId: requestId,
        type: eventData.type,
        portalUserId: eventData.portalUserId,
        actorId: eventData.actorId,
        note: eventData.note,
        changes: eventData.changes,
      },
    ]);

    return updated;
  });

/** The `delete_comment` every cascaded quotation carries, so a staff member
 *  reading the quotation alone can see why it went (owner, 2026-09-03). */
export const cancelledByClientComment = (reason: string): string =>
  `cancelled by client: ${reason}`;

/**
 * Withdraw a request: terminal status, soft delete, the reason event and the
 * quotation cascade, in one transaction. `isNull(deletedAt)` in the WHERE makes it idempotent — a second
 * cancel matches nothing and returns null rather than restamping the row or
 * appending a duplicate event.
 *
 * The caller checks the transition first; this guard is what closes the race
 * between that check and the write.
 */
export const cancelServiceRequest = async (
  db: Db,
  requestId: string,
  customerId: string,
  portalUserId: string,
  contactId: string,
  reason: string,
): Promise<ServiceRequestRow | null> =>
  db.transaction(async (tx) => {
    const now = new Date();
    const [updated] = await tx
      .update(serviceRequests)
      .set({
        status: ServiceRequestStatus.Cancelled,
        deletedAt: now,
        deletedByPortalUserId: portalUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(serviceRequests.id, requestId),
          eq(serviceRequests.customerId, customerId),
          isNull(serviceRequests.deletedAt),
        ),
      )
      .returning();
    if (!updated) return null;

    await appendEvents(tx, [
      {
        serviceRequestId: requestId,
        type: ServiceRequestEventType.Cancelled,
        portalUserId,
        note: reason,
      },
    ]);

    // The children go with it (owner, 2026-09-03). Same transaction, so a
    // request can never end up cancelled with its quotations still live.
    await softDeleteQuotationsForServiceRequest(
      tx,
      requestId,
      cancelledByClientComment(reason),
      contactId,
    );

    return updated;
  });
