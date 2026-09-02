import { and, asc, desc, eq, ilike, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { Db, Tx } from '../../database/client';
import { customers } from '../../customers/models/customers.model';
import { customerInteractions } from '../../customers/models/customer-interactions.model';
import { InteractionRefKind, InteractionType } from '../../customers/enums/interactions.enum';
import { users } from '../../users/models/users.model';
import { displayName } from '../../users/utils/display-name';
import { services } from '../../services/models/services.model';
import { reportCounters, reportDetails, reports } from '../../reports/models/reports.model';
import { ReportStatus } from '../../reports/enums/reports.enum';
import { isFinishedOrMailed, isVoidableByOrderCancel } from '../../reports/utils/report-lifecycle';
import { formatReportId } from '../../reports/utils/report-id';
import { reportTemplates } from '../../report-templates/models/report-templates.model';
import { TemplateStatus } from '../../report-templates/enums/report-templates.enum';
import {
  serviceOrderCounters,
  serviceOrderServices,
  serviceOrders,
} from '../models/service-orders.model';
import { quotations } from '../../quotations/models/quotations.model';
import {
  LIVE_STATUSES,
  QuotationEventRefKind,
  QuotationEventType,
  QuotationStatus,
} from '../../quotations/enums/quotations.enum';
import { appendEvents as appendQuotationEvents } from '../../quotations/repository/quotations.repository';
import { QuotationNotLiveError } from '../../quotations/http-errors/quotations.error';
import { appendOrderEvent, appendOrderEvents } from './service-order-events.repository';
import {
  ServiceOrderEventRefKind,
  ServiceOrderEventType,
  ServiceOrderPriority,
  ServiceOrderStatus,
} from '../enums/service-orders.enum';
import {
  InvalidOrderReferenceError,
  InvalidTemplateError,
  OrderClosedError,
} from '../http-errors/service-orders.error';
import { ExplosionTooLargeError } from '../http-errors/order-from-quotation.error';
import { formatServiceOrderFolio } from '../utils/service-order-folio';
import type {
  ConvertQuotationCommand,
  CreateOrderCommand,
  FrozenOrderLine,
  NewServiceOrderEvent,
  ServiceOrderFilters,
  ServiceOrderLineRow,
  ServiceOrderReportDTO,
  ServiceOrderRow,
} from '../types/service-orders.types';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';

const activeFilter = isNull(serviceOrders.deletedAt);

const dayString = (d: Date) => d.toISOString().slice(0, 10);

/** The quote this order was born from (20 §6), read from its only home
 *  (`quotations.service_order_id`). A correlated read rather than a join: an
 *  order collects several quotations over its life, and joining would return
 *  the order once per quote. Only the converted one is the birth link. */
const bornFromQuotation = sql<string | null>`(
  select ${quotations.id} from ${quotations}
  where ${quotations.serviceOrderId} = ${serviceOrders.id}
    and ${quotations.status} = ${QuotationStatus.OrderCreated}
  limit 1
)`;

/** Header columns plus the two names every order view renders. `createdBy` is
 *  left-joined even though the FK is NOT NULL: `restrict` keeps the row alive,
 *  but a left join costs nothing and never drops an order because its creator
 *  row went strange. */
const orderColumns = {
  id: serviceOrders.id,
  folio: serviceOrders.folio,
  customerId: serviceOrders.customerId,
  quotationId: bornFromQuotation,
  location: serviceOrders.location,
  priority: serviceOrders.priority,
  promisedDate: serviceOrders.promisedDate,
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
  quotationId: string | null;
  location: string | null;
  priority: ServiceOrderPriority;
  promisedDate: string | null;
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
  quotationId: string | null;
  location: string | null;
  priority: ServiceOrderPriority;
  promisedDate: string | null;
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
  quotationId: row.quotationId,
  location: row.location,
  priority: row.priority,
  promisedDate: row.promisedDate,
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
  if (filters.priority) conds.push(eq(serviceOrders.priority, filters.priority));
  // Overdue = open AND the promise already broke (CP-2b). Compared against the
  // server's CURRENT_DATE — the UTC day flip fires a few hours early on
  // Monterrey evenings, accepted in v1. A null promised_date never matches.
  if (filters.overdue) {
    conds.push(
      eq(serviceOrders.status, ServiceOrderStatus.Open),
      lt(serviceOrders.promisedDate, sql`CURRENT_DATE`),
    );
  }
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
): Promise<GenericQueryResponse<OrderHeaderRow>> => {
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

  return { items: rows.map(toHeader), total: countRows[0]?.count ?? 0, page, limit };
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

/** Progress counts for a page of orders in one grouped round trip (CP-2b) —
 *  the same shape as `listLinesForOrders`. Finished = finished | mailed;
 *  cancelled reports are excluded from BOTH counts: the denominator is real
 *  work, not the rows a cancellation voided. */
export const countReportsForOrders = async (
  db: Db,
  orderIds: string[],
): Promise<{ serviceOrderId: string; total: number; finished: number }[]> => {
  if (orderIds.length === 0) return [];
  const finishedStatuses = Object.values(ReportStatus).filter(isFinishedOrMailed);
  const rows = await db
    .select({
      serviceOrderId: reports.serviceOrderId,
      total: sql<number>`count(*)::int`,
      finished: sql<number>`count(*) filter (where ${inArray(reports.status, finishedStatuses)})::int`,
    })
    .from(reports)
    .where(
      and(
        inArray(reports.serviceOrderId, orderIds),
        sql`${reports.status} <> ${ReportStatus.Cancelled}`,
        isNull(reports.deletedAt),
      ),
    )
    .groupBy(reports.serviceOrderId);
  // The FK column is nullable in the model (standalone reports), but every row
  // here matched the inArray — narrow it for the caller.
  return rows.map((r) => ({ ...r, serviceOrderId: r.serviceOrderId! }));
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
type OrderGraphInput = {
  customerId: string;
  location: string | null;
  comments: string | null;
  priority: ServiceOrderPriority;
  promisedDate: string | null;
  lines: FrozenOrderLine[];
  actorId: string;
  /** Extra ref on the opening `order_created` event (the quote path points it
   *  at the quotation, 20 §6). */
  openingRef?: { kind: ServiceOrderEventRefKind; id: string };
  /** Overrides the default opening-event / CRM-entry phrasing. */
  openingNote?: string;
};

/** The §2 order graph, on a caller-supplied transaction: counter → folio →
 *  order → lines → exploded `pending` reports → opening timeline events →
 *  customer CRM entry. Shared verbatim by both birth routes; callers own
 *  reference resolution *before* and any extra writes *after*, all inside the
 *  same `tx`. */
const insertOrderGraph = async (
  tx: Tx,
  input: OrderGraphInput,
  day: Date,
): Promise<{ order: ServiceOrderRow; lines: ServiceOrderLineRow[]; reportIds: string[] }> => {
  // The explosion is driven by each line's explicit report count, NOT its
  // money quantity (owner 2026-07-31): 1.5 hours of labor is one job that takes
  // 1.5 hours — or none at all, if the service only bills.
  const totalUnits = input.lines.reduce((sum, l) => sum + l.reportCount, 0);
  const count = input.lines.length;
  const countLabel = `${count} ${count === 1 ? 'servicio' : 'servicios'}`;

  const [orderCounter] = await tx
    .insert(serviceOrderCounters)
    .values({ day: dayString(day), lastNumber: 1 })
    .onConflictDoUpdate({
      target: serviceOrderCounters.day,
      set: { lastNumber: sql`${serviceOrderCounters.lastNumber} + 1` },
    })
    .returning({ lastNumber: serviceOrderCounters.lastNumber });
  if (!orderCounter) throw new Error('insertOrderGraph: counter upsert returned no row');

  const [order] = await tx
    .insert(serviceOrders)
    .values({
      folio: formatServiceOrderFolio(day, orderCounter.lastNumber),
      customerId: input.customerId,
      location: input.location,
      priority: input.priority,
      promisedDate: input.promisedDate,
      comments: input.comments,
      status: ServiceOrderStatus.Open,
      createdBy: input.actorId,
    })
    .returning();
  if (!order) throw new Error('insertOrderGraph: order insert returned no row');

  // The lines land exactly as frozen by the caller — this function never
  // consults the catalog (19 §1 / 20 §6).
  const lines = await tx
    .insert(serviceOrderServices)
    .values(
      input.lines.map((line) => ({
        serviceOrderId: order.id,
        serviceId: line.serviceId,
        serviceName: line.serviceName,
        uom: line.uom,
        taxRate: line.taxRate,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountAmount: line.discountAmount,
      })),
    )
    .returning();

  // One report per sold unit (19 §2, decided 2026-07-23). Sequence numbers are
  // reserved in a single counter bump rather than one upsert per report: same
  // atomicity, one round trip, and no chance of a partial reservation.
  // A materials-only order explodes nothing (owner 2026-07-31): no counter
  // bump — reserving zero sequence numbers would just churn the day's row.
  let sequence = 0;
  if (totalUnits > 0) {
    const [reportCounter] = await tx
      .insert(reportCounters)
      .values({ day: dayString(day), lastNumber: totalUnits })
      .onConflictDoUpdate({
        target: reportCounters.day,
        set: { lastNumber: sql`${reportCounters.lastNumber} + ${totalUnits}` },
      })
      .returning({ lastNumber: reportCounters.lastNumber });
    if (!reportCounter) throw new Error('insertOrderGraph: report counter returned no row');
    sequence = reportCounter.lastNumber - totalUnits + 1;
  }

  // Resolve all referenced templates to get their names (denormalized display
  // value). Batch lookup instead of per-unit to avoid N queries. Only lines
  // that explode carry a template, so a billing-only line contributes nothing
  // here — and an order made of nothing but charges queries not at all.
  const templateIds = [
    ...new Set(input.lines.flatMap((l) => (l.reportCount > 0 && l.templateId ? [l.templateId] : []))),
  ];
  const templateRows = templateIds.length
    ? await tx
        .select({ id: reportTemplates.id, name: reportTemplates.name })
        .from(reportTemplates)
        .where(inArray(reportTemplates.id, templateIds))
    : [];
  const templateNames = new Map(templateRows.map((r) => [r.id, r.name]));
  const reportRows: (typeof reports.$inferInsert)[] = [];
  const explodedReportIds: string[] = [];

  for (const line of input.lines) {
    // `reportCount` is 0 for billing-only lines — they explode nothing, so an
    // order of nothing but consumables mints no reports at all.
    if (line.reportCount === 0) continue;
    // A line that explodes carries its explosion inputs (the service layer
    // refuses one that doesn't), and `assertTemplatesActive` ran earlier in
    // this same transaction — so neither miss is reachable, and both must stay
    // loud if they ever become so. Defaulting to `''` would silently mint
    // reports with a blank template name, which nothing downstream detects.
    if (!line.templateId) throw new Error('insertOrderGraph: exploding line carries no template');
    const reportType = templateNames.get(line.templateId);
    if (!reportType) throw new InvalidTemplateError(line.templateId);
    for (let unit = 0; unit < line.reportCount; unit += 1) {
      const id = formatReportId(day, sequence);
      sequence += 1;
      explodedReportIds.push(id);
      reportRows.push({
        id,
        templateId: line.templateId,
        reportType, // Denormalized template name, captured at explosion time
        // Not on site yet — `dateArrival` is stamped when the technician
        // actually opens the report, unlike the manual path which defaults it
        // to now() precisely because opening one *is* arriving.
        dateArrival: null,
        createdBy: input.actorId,
        assignedTo: line.technicianId!,
        clientId: input.customerId,
        status: ReportStatus.Pending,
        serviceOrderId: order.id,
        serviceId: line.serviceId,
      });
    }
  }

  // The transaction-size backstop, applied where the RESOLVED counts are known
  // — the schema refine can only see what the caller sent, and a line that omits
  // `reportCount` takes a server-derived default.
  if (totalUnits > MAX_EXPLODED_REPORTS) throw new ExplosionTooLargeError(totalUnits);

  // Guarded: an order of nothing but charges has no skeletons, and the driver
  // rejects `values()` with an empty array.
  if (reportRows.length > 0) {
    await tx.insert(reports).values(reportRows);
    // Skeleton content rows: `data: {}` with `contentFilledAt` left null is the
    // "nothing filled in yet" state. They exist from birth because every
    // downstream read (`findReportWithDetails`) and every content write assumes
    // the row is there.
    await tx
      .insert(reportDetails)
      .values(reportRows.map((r) => ({ reportId: r.id, data: {}, pictures: [] })));
  }

  // The timeline opens with the creation (19 §2 step 3).
  const events: NewServiceOrderEvent[] = [
    {
      serviceOrderId: order.id,
      type: ServiceOrderEventType.OrderCreated,
      actorId: input.actorId,
      refKind: input.openingRef?.kind,
      refId: input.openingRef?.id,
      note: input.openingNote ?? `Orden creada con ${countLabel}`,
    },
    ...lines.map((line) => ({
      serviceOrderId: order.id,
      type: ServiceOrderEventType.OrderLineAdded,
      actorId: input.actorId,
      refKind: ServiceOrderEventRefKind.Line,
      refId: line.id,
      note: `${line.serviceName} × ${line.quantity} ${line.uom}`,
    })),
    ...explodedReportIds.map((reportId) => ({
      serviceOrderId: order.id,
      type: ServiceOrderEventType.ReportExploded,
      actorId: input.actorId,
      refKind: ServiceOrderEventRefKind.Report,
      refId: reportId,
    })),
  ];
  await appendOrderEvents(tx, events);

  // The *customer* timeline (08), complementary to the order's own: this one
  // answers "what happened with this client", not "what happened on this job".
  await tx.insert(customerInteractions).values({
    customerId: input.customerId,
    type: InteractionType.System,
    body: `Orden de servicio ${order.folio} creada — ${countLabel}`,
    refKind: InteractionRefKind.ServiceOrder,
    refId: order.id,
    userId: input.actorId,
  });

  return { order, lines, reportIds: explodedReportIds };
};

/** Both birth routes resolve the humans the same way: existence + not-deleted
 *  only, no role assertion — the same trusted-field posture report creation
 *  takes with `assignedTo`, and small shops do send an admin to site. */
const assertTechniciansExist = async (tx: Tx, technicianIds: string[]): Promise<void> => {
  const rows = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(inArray(users.id, technicianIds), isNull(users.deletedAt)));
  const found = new Set(rows.map((r) => r.id));
  const missing = technicianIds.find((id) => !found.has(id));
  if (missing) throw new InvalidOrderReferenceError('technician', missing);
};

const assertCustomerExists = async (tx: Tx, customerId: string): Promise<void> => {
  const [customer] = await tx
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.id, customerId), isNull(customers.deletedAt)))
    .limit(1);
  if (!customer) throw new InvalidOrderReferenceError('customer', customerId);
};

/** Validate that all referenced templates exist and are active. Assignment is
 *  an admin-tier action (§3.5), so validation happens here, never at report sync.
 *  Throws InvalidTemplateError if any template doesn't exist or is not active. */
const assertTemplatesActive = async (tx: Tx, templateIds: string[]): Promise<void> => {
  const unique = [...new Set(templateIds)];
  const rows = await tx
    .select({ id: reportTemplates.id, status: reportTemplates.status })
    .from(reportTemplates)
    .where(inArray(reportTemplates.id, unique));
  const found = new Map(rows.map((r) => [r.id, r.status]));

  for (const id of unique) {
    const status = found.get(id);
    if (!status || status !== TemplateStatus.Active) {
      throw new InvalidTemplateError(id);
    }
  }
};

export const createServiceOrder = async (
  db: Db,
  command: CreateOrderCommand,
  day: Date = new Date(),
): Promise<{ order: ServiceOrderRow; lines: ServiceOrderLineRow[]; reportIds: string[] }> => {
  const serviceIds = [
    ...new Set(command.lines.flatMap((l) => (l.serviceId ? [l.serviceId] : []))),
  ];
  // Billing-only lines (reportCount 0) name neither technician nor template —
  // nothing to assert for them.
  const technicianIds = [
    ...new Set(command.lines.flatMap((l) => (l.technicianId ? [l.technicianId] : []))),
  ];
  const templateIds = [
    ...new Set(command.lines.flatMap((l) => (l.templateId ? [l.templateId] : []))),
  ];

  return db.transaction(async (tx) => {
    await assertCustomerExists(tx, command.customerId);
    await assertTechniciansExist(tx, technicianIds);
    await assertTemplatesActive(tx, templateIds);

    // The direct path freezes the LIVE catalog here — and refuses soft-deleted
    // services, which satisfy the FK perfectly well while being exactly what
    // we must not sell (unlike the quote path, where a since-deleted service
    // stays honored because the client already accepted it).
    const catalogRows = await tx
      .select({
        id: services.id,
        name: services.name,
        uom: services.uom,
        taxRate: services.taxRate,
        price: services.price,
        isReportSource: services.isReportSource,
      })
      .from(services)
      .where(and(inArray(services.id, serviceIds), isNull(services.deletedAt)));
    const catalog = new Map(catalogRows.map((r) => [r.id, r]));
    const missingService = serviceIds.find((id) => !catalog.has(id));
    if (missingService) throw new InvalidOrderReferenceError('service', missingService);

    return insertOrderGraph(
      tx,
      {
        customerId: command.customerId,
        location: command.location,
        comments: command.comments,
        priority: command.priority,
        promisedDate: command.promisedDate,
        actorId: command.actorId,
        // Catalog lines freeze the live catalog; off-catalog ones carry their
        // own snapshot. `reportCount` defaults from the service's
        // `isReportSource` (owner 2026-07-31) — a job explodes per unit, a
        // charge explodes nothing — and an explicit count from the caller wins.
        lines: command.lines.map((line) => {
          const service = line.serviceId ? catalog.get(line.serviceId)! : undefined;
          return {
            serviceId: line.serviceId ?? null,
            serviceName: service?.name ?? line.name!,
            uom: service?.uom ?? line.uom!,
            taxRate: service?.taxRate ?? line.taxRate!,
            quantity: line.quantity,
            unitPrice: service?.price ?? line.unitPrice!,
            discountAmount: line.discountAmount ?? '0.00',
            reportCount: line.reportCount ?? defaultReportCount(service?.isReportSource, line.quantity),
            technicianId: line.technicianId ?? null,
            templateId: line.templateId ?? null,
          };
        }),
      },
      day,
    );
  });
};

/** The explosion count a line takes when the caller doesn't say (owner
 *  2026-07-31). A catalog service that IS a report source explodes one report
 *  per whole unit — and a single report for a fractional quantity, because half
 *  a job is still one job. Everything else (a billing-only service, an
 *  off-catalog concept) explodes nothing until staff ask for it. */
/** The transaction-size cap on exploded reports (19 §2 caps, 2026-07-27),
 *  enforced here because only the resolved counts are the real ones. */
export const MAX_EXPLODED_REPORTS = 50;

export const defaultReportCount = (
  isReportSource: boolean | undefined,
  quantity: string,
): number => {
  if (!isReportSource) return 0;
  const units = Number(quantity);
  return Number.isInteger(units) ? units : 1;
};

/** The convergence (20 §6): one transaction that opens the order off the
 *  quotation's frozen line snapshots and flips the quote to `order_created`.
 *
 *  The caller (service layer) has already run the gates — live status, expiry,
 *  approvals, assignment coverage — against a plain read; the guarded UPDATE on
 *  `quotations` here re-checks liveness *inside* the transaction, so two
 *  concurrent conversions (or a convert racing a cancel) can't both win: the
 *  loser matches zero rows and the whole graph rolls back. */
export const createServiceOrderFromQuotation = async (
  db: Db,
  command: ConvertQuotationCommand,
  day: Date = new Date(),
): Promise<{ order: ServiceOrderRow; lines: ServiceOrderLineRow[]; reportIds: string[] }> => {
  // Billing-only lines (reportCount 0) name neither technician nor template —
  // nothing to assert for them.
  const technicianIds = [
    ...new Set(command.lines.flatMap((l) => (l.technicianId ? [l.technicianId] : []))),
  ];
  const templateIds = [
    ...new Set(command.lines.flatMap((l) => (l.templateId ? [l.templateId] : []))),
  ];

  return db.transaction(async (tx) => {
    await assertCustomerExists(tx, command.customerId);
    await assertTechniciansExist(tx, technicianIds);
    await assertTemplatesActive(tx, templateIds);

    // No catalog read: the lines are the quotation's snapshots, inherited
    // verbatim — what's serviced/billed matches exactly what the client
    // approved, even if the catalog repriced (or dropped) a service since.
    const graph = await insertOrderGraph(
      tx,
      {
        customerId: command.customerId,
        location: command.location,
        comments: null,
        // The conversion carries no dispatch inputs — a converted order joins
        // the normal queue with no promise yet; staff set both via PATCH after.
        priority: ServiceOrderPriority.Normal,
        promisedDate: null,
        actorId: command.actorId,
        // Already frozen by the conversion service — inherited verbatim, no
        // catalog read (19 §1 / 20 §6).
        lines: command.lines,
        openingRef: { kind: ServiceOrderEventRefKind.Quotation, id: command.quotationId },
        openingNote: `Orden creada desde la cotización ${command.quotationFolio}`,
      },
      day,
    );

    // Flip the quote — terminal, comment-carrying (20 §2), guarded on liveness.
    const [flipped] = await tx
      .update(quotations)
      .set({
        status: QuotationStatus.OrderCreated,
        serviceOrderId: graph.order.id,
        orderCreatedAt: new Date(),
        resolutionReason: command.comment,
        resolvedByUserId: command.actorId,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(quotations.id, command.quotationId),
          inArray(quotations.status, LIVE_STATUSES),
          isNull(quotations.deletedAt),
        ),
      )
      .returning({ id: quotations.id });
    if (!flipped) throw new QuotationNotLiveError(QuotationStatus.OrderCreated);

    // The quote's own timeline records the conversion (20 §5) — same
    // transaction, so the pre-sale trail can't drift from the order it opened.
    await appendQuotationEvents(tx, [
      {
        quotationId: command.quotationId,
        type: QuotationEventType.OrderCreated,
        actorId: command.actorId,
        refKind: QuotationEventRefKind.ServiceOrder,
        refId: graph.order.id,
        note: command.comment,
        // Flags the owner/admin override when converted without a single
        // approval (20 §5) — the trail must show the gate was consciously
        // bypassed, not met.
        changes: { approvedCount: command.approvedCount, override: command.override },
      },
    ]);

    return graph;
  });
};

// --- MUTATIONS ---

/** The mutable logistics metadata (19 §1, extended by CP-2b): `comments`,
 *  `location`, `priority` and/or `promisedDate` — and only while the order is
 *  `open` (decided 2026-07-29): a closed order is history and the handoff
 *  document has already composed from it, so even the mutable fields freeze at
 *  complete/cancel. Every mutation audits to the timeline in the same
 *  transaction. Returns null when the order doesn't exist (or is tombstoned),
 *  which the service maps to 404; a closed order throws instead (409), checked
 *  inside the transaction so a racing complete can't slip an edit through. */
export const updateServiceOrder = async (
  db: Db,
  id: string,
  fields: {
    comments?: string | null;
    location?: string | null;
    priority?: ServiceOrderPriority;
    promisedDate?: string | null;
  },
  actorId: string,
): Promise<ServiceOrderRow | null> =>
  db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(serviceOrders)
      .where(and(eq(serviceOrders.id, id), activeFilter))
      .limit(1);
    if (!current) return null;
    if (current.status !== ServiceOrderStatus.Open) throw new OrderClosedError(current.status);

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
    if (fields.priority !== undefined && fields.priority !== current.priority) {
      events.push({
        serviceOrderId: id,
        type: ServiceOrderEventType.OrderPriorityChanged,
        actorId,
        changes: { priority: { from: current.priority, to: fields.priority } },
      });
    }
    if (fields.promisedDate !== undefined && fields.promisedDate !== current.promisedDate) {
      events.push({
        serviceOrderId: id,
        type: ServiceOrderEventType.OrderPromiseChanged,
        actorId,
        changes: { promisedDate: { from: current.promisedDate, to: fields.promisedDate } },
      });
    }
    await appendOrderEvents(tx, events);

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

    await appendOrderEvent(tx, {
      serviceOrderId: id,
      type: ServiceOrderEventType.OrderCompleted,
      actorId,
      changes: { status: { from: ServiceOrderStatus.Open, to: ServiceOrderStatus.Completed } },
      note: note ?? null,
    });

    return updated;
  });

/** Reopen a completed order (CP-2b) — the safety valve for a fat-fingered
 *  Completar, not a flow. Guarded on `completed` in the UPDATE itself, so only
 *  that exact state can move back; `cancelled` stays terminal (its cascade
 *  voided children, and un-voiding cannot be done honestly). Emits the
 *  reserved `order_status_changed` event — exactly what that member was
 *  reserved for. The caller (service) gates the role to owner/admin. */
export const reopenServiceOrder = async (
  db: Db,
  id: string,
  actorId: string,
  note?: string,
): Promise<ServiceOrderRow | null> =>
  db.transaction(async (tx) => {
    const [updated] = await tx
      .update(serviceOrders)
      .set({ status: ServiceOrderStatus.Open, updatedAt: new Date() })
      .where(
        and(
          eq(serviceOrders.id, id),
          eq(serviceOrders.status, ServiceOrderStatus.Completed),
          activeFilter,
        ),
      )
      .returning();
    if (!updated) return null;

    await appendOrderEvent(tx, {
      serviceOrderId: id,
      type: ServiceOrderEventType.OrderStatusChanged,
      actorId,
      changes: { status: { from: ServiceOrderStatus.Completed, to: ServiceOrderStatus.Open } },
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

    // …but emit events only for rows the UPDATE actually voided: under READ
    // COMMITTED a report can reach `finished` between the two statements, and
    // the re-checked filter rightly skips it — logging it as cancelled from the
    // stale pre-read would put a lie on the trail the handoff composes from.
    let voidedIds = new Set<string>();
    if (doomed.length > 0) {
      const voided = await tx
        .update(reports)
        .set({ status: ReportStatus.Cancelled, updatedAt: new Date() })
        .where(
          and(
            eq(reports.serviceOrderId, id),
            inArray(reports.status, voidable),
            isNull(reports.deletedAt),
          ),
        )
        .returning({ id: reports.id });
      voidedIds = new Set(voided.map((r) => r.id));
    }

    await appendOrderEvents(tx, [
      {
        serviceOrderId: id,
        type: ServiceOrderEventType.OrderCancelled,
        actorId,
        changes: { status: { from: ServiceOrderStatus.Open, to: ServiceOrderStatus.Cancelled } },
        note: note ?? null,
      },
      ...doomed
        .filter((report) => voidedIds.has(report.id))
        .map((report) => ({
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
