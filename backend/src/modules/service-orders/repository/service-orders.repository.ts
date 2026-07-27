import { and, asc, desc, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import type { Db } from '../../database/client';
import { customers } from '../../customers/models/customers.model';
import { customerInteractions } from '../../customers/models/customer-interactions.model';
import { InteractionRefKind, InteractionType } from '../../customers/enums/interactions.enum';
import { users } from '../../users/models/users.model';
import { displayName } from '../../users/utils/display-name';
import { services } from '../../services/models/services.model';
import { reportCounters, reportDetails, reports } from '../../reports/models/reports.model';
import { ReportStatus } from '../../reports/enums/reports.enum';
import { isVoidableByOrderCancel } from '../../reports/utils/report-lifecycle';
import { formatReportId } from '../../reports/utils/report-id';
import {
  serviceOrderCounters,
  serviceOrderServices,
  serviceOrders,
} from '../models/service-orders.model';
import { serviceOrderEvents } from '../models/service-order-events.model';
import {
  ServiceOrderEventRefKind,
  ServiceOrderEventType,
  ServiceOrderStatus,
} from '../enums/service-orders.enum';
import { InvalidOrderReferenceError } from '../http-errors/service-orders.error';
import { formatServiceOrderFolio } from '../utils/service-order-folio';
import type {
  CreateOrderCommand,
  NewServiceOrderEvent,
  ServiceOrderFilters,
  ServiceOrderLineRow,
  ServiceOrderReportDTO,
  ServiceOrderRow,
} from '../types/service-orders.types';

const activeFilter = isNull(serviceOrders.deletedAt);

const dayString = (d: Date) => d.toISOString().slice(0, 10);

/** Header columns plus the two names every order view renders. `createdBy` is
 *  left-joined even though the FK is NOT NULL: `restrict` keeps the row alive,
 *  but a left join costs nothing and never drops an order because its creator
 *  row went strange. */
const orderColumns = {
  id: serviceOrders.id,
  folio: serviceOrders.folio,
  customerId: serviceOrders.customerId,
  location: serviceOrders.location,
  status: serviceOrders.status,
  comments: serviceOrders.comments,
  createdBy: serviceOrders.createdBy,
  createdAt: serviceOrders.createdAt,
  updatedAt: serviceOrders.updatedAt,
  customerName: customers.name,
  creatorName: users.name,
  creatorPaternalLastName: users.paternalLastName,
  creatorMaternalLastName: users.maternalLastName,
};

export type OrderHeaderRow = {
  id: string;
  folio: string;
  customerId: string;
  customerName: string;
  location: string | null;
  status: ServiceOrderStatus;
  comments: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
};

const toHeader = (row: {
  id: string;
  folio: string;
  customerId: string;
  location: string | null;
  status: ServiceOrderStatus;
  comments: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  customerName: string | null;
  creatorName: string | null;
  creatorPaternalLastName: string | null;
  creatorMaternalLastName: string | null;
}): OrderHeaderRow => ({
  id: row.id,
  folio: row.folio,
  customerId: row.customerId,
  customerName: row.customerName ?? '',
  location: row.location,
  status: row.status,
  comments: row.comments,
  createdBy: row.createdBy,
  createdByName: displayName({
    name: row.creatorName,
    paternalLastName: row.creatorPaternalLastName,
    maternalLastName: row.creatorMaternalLastName,
  }),
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
});

const buildFilters = (filters: ServiceOrderFilters) => {
  const conds = [activeFilter];
  if (filters.customerId) conds.push(eq(serviceOrders.customerId, filters.customerId));
  if (filters.status) conds.push(eq(serviceOrders.status, filters.status));
  // Folio prefix match — `OS-2026` narrows to a year, a full folio finds one
  // order. Same shape as the reports list's folio filter.
  if (filters.search) conds.push(ilike(serviceOrders.folio, `${filters.search}%`));
  return and(...conds);
};

/** Paged, newest-first (19 §4). Returns headers only; the caller fetches the
 *  page's lines in one follow-up query (`listLinesForOrders`) rather than
 *  aggregating money in SQL — per-line tax rates would need a CASE ladder here
 *  and an exact-cents reimplementation of `order-money.ts` alongside it. */
export const listServiceOrders = async (
  db: Db,
  filters: ServiceOrderFilters,
  page: number,
  limit: number,
): Promise<{ items: OrderHeaderRow[]; total: number }> => {
  const where = buildFilters(filters);

  const rows = await db
    .select(orderColumns)
    .from(serviceOrders)
    .innerJoin(customers, eq(serviceOrders.customerId, customers.id))
    .leftJoin(users, eq(serviceOrders.createdBy, users.id))
    .where(where)
    .orderBy(desc(serviceOrders.createdAt))
    .limit(limit)
    .offset((page - 1) * limit);

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(serviceOrders)
    .where(where);

  return { items: rows.map(toHeader), total: countRows[0]?.count ?? 0 };
};

export const findServiceOrderById = async (
  db: Db,
  id: string,
): Promise<OrderHeaderRow | null> => {
  const [row] = await db
    .select(orderColumns)
    .from(serviceOrders)
    .innerJoin(customers, eq(serviceOrders.customerId, customers.id))
    .leftJoin(users, eq(serviceOrders.createdBy, users.id))
    .where(and(eq(serviceOrders.id, id), activeFilter))
    .limit(1);
  return row ? toHeader(row) : null;
};

/** Lines for one order, insertion-ordered so the review screen matches the
 *  order the builder was filled in. */
export const listOrderLines = async (
  db: Db,
  serviceOrderId: string,
): Promise<ServiceOrderLineRow[]> =>
  db
    .select()
    .from(serviceOrderServices)
    .where(eq(serviceOrderServices.serviceOrderId, serviceOrderId))
    .orderBy(asc(serviceOrderServices.createdAt));

/** Lines for a whole page of orders in one round trip — the list's
 *  services-count and total columns. */
export const listLinesForOrders = async (
  db: Db,
  orderIds: string[],
): Promise<ServiceOrderLineRow[]> => {
  if (orderIds.length === 0) return [];
  return db
    .select()
    .from(serviceOrderServices)
    .where(inArray(serviceOrderServices.serviceOrderId, orderIds));
};

/** The exploded reports hanging off one order (19 §4). Soft-deleted reports
 *  drop out; `cancelled` ones stay, because "this was voided when the order was
 *  cancelled" is exactly what the order view needs to show. */
export const listOrderReports = async (
  db: Db,
  serviceOrderId: string,
): Promise<ServiceOrderReportDTO[]> => {
  const rows = await db
    .select({
      id: reports.id,
      status: reports.status,
      reportType: reports.reportType,
      serviceId: reports.serviceId,
      assignedTo: reports.assignedTo,
      createdAt: reports.createdAt,
      assigneeName: users.name,
      assigneePaternalLastName: users.paternalLastName,
      assigneeMaternalLastName: users.maternalLastName,
    })
    .from(reports)
    .leftJoin(users, eq(reports.assignedTo, users.id))
    .where(and(eq(reports.serviceOrderId, serviceOrderId), isNull(reports.deletedAt)))
    .orderBy(asc(reports.createdAt));

  return rows.map((row) => ({
    id: row.id,
    folio: row.id,
    status: row.status,
    reportType: row.reportType,
    serviceId: row.serviceId,
    assignedTo: row.assignedTo,
    assignedToName:
      displayName({
        name: row.assigneeName,
        paternalLastName: row.assigneePaternalLastName,
        maternalLastName: row.assigneeMaternalLastName,
      }) || undefined,
    createdAt: row.createdAt.toISOString(),
  }));
};

// --- CREATE ---

/** The one transaction (19 §2): folio → order → lines → exploded reports →
 *  timeline → customer interaction. Either all of it lands or none of it does.
 *
 *  References are resolved up front **inside** the transaction rather than
 *  leaning on FK violations, for two reasons: the catalog snapshot needs the
 *  service rows anyway, and a soft-deleted service satisfies the FK perfectly
 *  well while being exactly what we must refuse to sell.
 */
export const createServiceOrder = async (
  db: Db,
  command: CreateOrderCommand,
  day: Date = new Date(),
): Promise<{ order: ServiceOrderRow; lines: ServiceOrderLineRow[]; reportIds: string[] }> => {
  const serviceIds = [...new Set(command.lines.map((l) => l.serviceId))];
  const technicianIds = [...new Set(command.lines.map((l) => l.technicianId))];
  const totalUnits = command.lines.reduce((sum, l) => sum + l.quantity, 0);

  return db.transaction(async (tx) => {
    const [customer] = await tx
      .select({ id: customers.id })
      .from(customers)
      .where(and(eq(customers.id, command.customerId), isNull(customers.deletedAt)))
      .limit(1);
    if (!customer) throw new InvalidOrderReferenceError('customer', command.customerId);

    // Existence + not-deleted only, no role assertion: the same trusted-field
    // posture report creation already takes with `assignedTo`, and small shops
    // do send an admin to site.
    const technicianRows = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(inArray(users.id, technicianIds), isNull(users.deletedAt)));
    const foundTechnicians = new Set(technicianRows.map((r) => r.id));
    const missingTechnician = technicianIds.find((id) => !foundTechnicians.has(id));
    if (missingTechnician) throw new InvalidOrderReferenceError('technician', missingTechnician);

    const catalogRows = await tx
      .select({
        id: services.id,
        name: services.name,
        uom: services.uom,
        taxRate: services.taxRate,
        price: services.price,
      })
      .from(services)
      .where(and(inArray(services.id, serviceIds), isNull(services.deletedAt)));
    const catalog = new Map(catalogRows.map((r) => [r.id, r]));
    const missingService = serviceIds.find((id) => !catalog.has(id));
    if (missingService) throw new InvalidOrderReferenceError('service', missingService);

    const [orderCounter] = await tx
      .insert(serviceOrderCounters)
      .values({ day: dayString(day), lastNumber: 1 })
      .onConflictDoUpdate({
        target: serviceOrderCounters.day,
        set: { lastNumber: sql`${serviceOrderCounters.lastNumber} + 1` },
      })
      .returning({ lastNumber: serviceOrderCounters.lastNumber });
    if (!orderCounter) throw new Error('createServiceOrder: counter upsert returned no row');

    const [order] = await tx
      .insert(serviceOrders)
      .values({
        folio: formatServiceOrderFolio(day, orderCounter.lastNumber),
        customerId: command.customerId,
        location: command.location,
        comments: command.comments,
        status: ServiceOrderStatus.Open,
        createdBy: command.actorId,
      })
      .returning();
    if (!order) throw new Error('createServiceOrder: order insert returned no row');

    // Price/name/uom/tax are frozen here — catalog edits after this moment never
    // rewrite what the client agreed to (19 §1).
    const lines = await tx
      .insert(serviceOrderServices)
      .values(
        command.lines.map((line) => {
          const service = catalog.get(line.serviceId)!;
          return {
            serviceOrderId: order.id,
            serviceId: line.serviceId,
            serviceName: service.name,
            uom: service.uom,
            taxRate: service.taxRate,
            quantity: line.quantity,
            unitPrice: service.price,
          };
        }),
      )
      .returning();

    // One report per sold unit (19 §2, decided 2026-07-23). Sequence numbers are
    // reserved in a single counter bump rather than one upsert per report: same
    // atomicity, one round trip, and no chance of a partial reservation.
    const [reportCounter] = await tx
      .insert(reportCounters)
      .values({ day: dayString(day), lastNumber: totalUnits })
      .onConflictDoUpdate({
        target: reportCounters.day,
        set: { lastNumber: sql`${reportCounters.lastNumber} + ${totalUnits}` },
      })
      .returning({ lastNumber: reportCounters.lastNumber });
    if (!reportCounter) throw new Error('createServiceOrder: report counter returned no row');

    let sequence = reportCounter.lastNumber - totalUnits + 1;
    const reportRows: (typeof reports.$inferInsert)[] = [];
    const explodedReportIds: string[] = [];

    for (const line of command.lines) {
      for (let unit = 0; unit < line.quantity; unit += 1) {
        const id = formatReportId(day, sequence);
        sequence += 1;
        explodedReportIds.push(id);
        reportRows.push({
          id,
          reportType: line.reportType,
          // Not on site yet — `dateArrival` is stamped when the technician
          // actually opens the report, unlike the manual path which defaults it
          // to now() precisely because opening one *is* arriving.
          dateArrival: null,
          createdBy: command.actorId,
          assignedTo: line.technicianId,
          clientId: command.customerId,
          status: ReportStatus.Pending,
          serviceOrderId: order.id,
          serviceId: line.serviceId,
        });
      }
    }

    await tx.insert(reports).values(reportRows);
    // Skeleton content rows: `data: {}` with `contentFilledAt` left null is the
    // "nothing filled in yet" state. They exist from birth because every
    // downstream read (`findReportWithDetails`) and every content write assumes
    // the row is there.
    await tx
      .insert(reportDetails)
      .values(reportRows.map((r) => ({ reportId: r.id, data: {}, pictures: [] })));

    // The timeline opens with the creation (19 §2 step 3).
    const events: NewServiceOrderEvent[] = [
      {
        serviceOrderId: order.id,
        type: ServiceOrderEventType.OrderCreated,
        actorId: command.actorId,
        note: `Orden creada con ${lines.length} ${lines.length === 1 ? 'servicio' : 'servicios'}`,
      },
      ...lines.map((line) => ({
        serviceOrderId: order.id,
        type: ServiceOrderEventType.OrderLineAdded,
        actorId: command.actorId,
        refKind: ServiceOrderEventRefKind.Line,
        refId: line.id,
        note: `${line.serviceName} × ${line.quantity} ${line.uom}`,
      })),
      ...explodedReportIds.map((reportId) => ({
        serviceOrderId: order.id,
        type: ServiceOrderEventType.ReportExploded,
        actorId: command.actorId,
        refKind: ServiceOrderEventRefKind.Report,
        refId: reportId,
      })),
    ];
    await tx.insert(serviceOrderEvents).values(events);

    // The *customer* timeline (08), complementary to the order's own: this one
    // answers "what happened with this client", not "what happened on this job".
    await tx.insert(customerInteractions).values({
      customerId: command.customerId,
      type: InteractionType.System,
      body: `Orden de servicio ${order.folio} creada — ${lines.length} ${
        lines.length === 1 ? 'servicio' : 'servicios'
      }`,
      refKind: InteractionRefKind.ServiceOrder,
      refId: order.id,
      userId: command.actorId,
    });

    return { order, lines, reportIds: explodedReportIds };
  });
};

// --- MUTATIONS ---

/** `comments` and/or `location` — the only patchable fields (19 §1). Both
 *  mutations audit to the timeline in the same transaction. Returns null when
 *  the order doesn't exist (or is tombstoned), which the service maps to 404. */
export const updateServiceOrder = async (
  db: Db,
  id: string,
  fields: { comments?: string | null; location?: string | null },
  actorId: string,
): Promise<ServiceOrderRow | null> =>
  db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(serviceOrders)
      .where(and(eq(serviceOrders.id, id), activeFilter))
      .limit(1);
    if (!current) return null;

    const [updated] = await tx
      .update(serviceOrders)
      .set({ ...fields, updatedAt: new Date() })
      .where(and(eq(serviceOrders.id, id), activeFilter))
      .returning();
    if (!updated) return null;

    const events: NewServiceOrderEvent[] = [];
    // A no-op PATCH (same value posted back) writes no event — the timeline
    // records changes, not saves.
    if (fields.comments !== undefined && fields.comments !== current.comments) {
      events.push({
        serviceOrderId: id,
        type: ServiceOrderEventType.OrderCommentUpdated,
        actorId,
        changes: { comments: { from: current.comments, to: fields.comments } },
      });
    }
    if (fields.location !== undefined && fields.location !== current.location) {
      events.push({
        serviceOrderId: id,
        type: ServiceOrderEventType.OrderLocationChanged,
        actorId,
        changes: { location: { from: current.location, to: fields.location } },
      });
    }
    if (events.length > 0) await tx.insert(serviceOrderEvents).values(events);

    return updated;
  });

/** Complete an order (19 §2). Guarded on `open` in the UPDATE itself, so a
 *  double-submit loses the race rather than double-completing; a null return
 *  means "not open" (or gone) and the service turns it into the 409.
 *
 *  `order_completed` is the event CP-5 hangs the client handoff document off. */
export const completeServiceOrder = async (
  db: Db,
  id: string,
  actorId: string,
  note?: string,
): Promise<ServiceOrderRow | null> =>
  db.transaction(async (tx) => {
    const [updated] = await tx
      .update(serviceOrders)
      .set({ status: ServiceOrderStatus.Completed, updatedAt: new Date() })
      .where(
        and(eq(serviceOrders.id, id), eq(serviceOrders.status, ServiceOrderStatus.Open), activeFilter),
      )
      .returning();
    if (!updated) return null;

    await tx.insert(serviceOrderEvents).values({
      serviceOrderId: id,
      type: ServiceOrderEventType.OrderCompleted,
      actorId,
      changes: { status: { from: ServiceOrderStatus.Open, to: ServiceOrderStatus.Completed } },
      note: note ?? null,
    });

    return updated;
  });

/** Cancel an order and void the work that hadn't happened yet (19 §2).
 *
 *  `pending`/`in-progress` reports become `cancelled`; `finished`/`mailed` ones
 *  are left exactly as they are, because they are history. Nothing is deleted —
 *  this is a lifecycle transition (no-hard-delete rule). Each voided report
 *  appends its own `report_status_changed` event, so the handoff document can
 *  show what was called off and when.
 *
 *  Visits are absent here in CP-1: the table doesn't exist yet (PR #97 closed
 *  unmerged). 12's rebuild in CP-3 adds the close pass — category `other`,
 *  reason "orden cancelada" — to this same transaction.
 */
export const cancelServiceOrder = async (
  db: Db,
  id: string,
  actorId: string,
  note?: string,
): Promise<ServiceOrderRow | null> =>
  db.transaction(async (tx) => {
    const [updated] = await tx
      .update(serviceOrders)
      .set({ status: ServiceOrderStatus.Cancelled, updatedAt: new Date() })
      .where(
        and(eq(serviceOrders.id, id), eq(serviceOrders.status, ServiceOrderStatus.Open), activeFilter),
      )
      .returning();
    if (!updated) return null;

    const voidable = Object.values(ReportStatus).filter(isVoidableByOrderCancel);
    // Read the prior statuses *before* the update: the event's `from` is the
    // whole point of the diff, and `returning()` can only ever hand back the
    // new value.
    const doomed = await tx
      .select({ id: reports.id, status: reports.status })
      .from(reports)
      .where(
        and(
          eq(reports.serviceOrderId, id),
          inArray(reports.status, voidable),
          isNull(reports.deletedAt),
        ),
      );

    if (doomed.length > 0) {
      await tx
        .update(reports)
        .set({ status: ReportStatus.Cancelled, updatedAt: new Date() })
        .where(
          and(
            eq(reports.serviceOrderId, id),
            inArray(reports.status, voidable),
            isNull(reports.deletedAt),
          ),
        );
    }

    await tx.insert(serviceOrderEvents).values([
      {
        serviceOrderId: id,
        type: ServiceOrderEventType.OrderCancelled,
        actorId,
        changes: { status: { from: ServiceOrderStatus.Open, to: ServiceOrderStatus.Cancelled } },
        note: note ?? null,
      },
      ...doomed.map((report) => ({
        serviceOrderId: id,
        type: ServiceOrderEventType.ReportStatusChanged,
        actorId,
        refKind: ServiceOrderEventRefKind.Report,
        refId: report.id,
        changes: { status: { from: report.status, to: ReportStatus.Cancelled } },
        note: 'Cancelado con la orden',
      })),
    ]);

    return updated;
  });
