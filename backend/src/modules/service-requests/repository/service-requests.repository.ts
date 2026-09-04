import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
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
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';

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

/**
 * List requests for a customer, newest first, with a real total count.
 * Takes page/limit; offset is computed internally.
 */
export const listServiceRequestsForCustomer = async (
  db: Db,
  customerId: string,
  page: number = 1,
  limit: number = 50,
): Promise<GenericQueryResponse<ServiceRequestRow>> => {
  const offset = (page - 1) * limit;
  const [rows, totalResult] = await Promise.all([
    db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.customerId, customerId))
      .orderBy(desc(serviceRequests.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: count() })
      .from(serviceRequests)
      .where(eq(serviceRequests.customerId, customerId)),
  ]);

  const total = totalResult[0]?.total ?? 0;
  return { items: rows, total, page, limit };
};

/**
 * Find a request by ID for a specific customer. Returns null if not found or
 * belongs to a different customer. Scope is enforced in the WHERE clause.
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
