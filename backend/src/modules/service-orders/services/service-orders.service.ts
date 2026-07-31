import type { Db } from '../../database/client';
import type { AuthUser } from '../../../env';
import { isAdminTier, isBackOfficeTier } from '../../auth/utils/role-tier';
import {
  cancelServiceOrder,
  completeServiceOrder,
  countReportsForOrders,
  createServiceOrder,
  findServiceOrderById,
  listLinesForOrders,
  listOrderLines,
  listOrderReports,
  listServiceOrders,
  reopenServiceOrder,
  updateServiceOrder,
  type OrderHeaderRow,
} from '../repository/service-orders.repository';
import { listOrderEvents } from '../repository/service-order-events.repository';
import { ServiceOrderPriority, ServiceOrderStatus } from '../enums/service-orders.enum';
import {
  InvalidOrderTransitionError,
  LocationEditForbiddenError,
  ReopenForbiddenError,
} from '../http-errors/service-orders.error';
import { lineAmounts, orderAmounts } from '../utils/order-money';
import type {
  CreateServiceOrderInput,
  ListServiceOrdersQuery,
  SetServiceOrderStatusInput,
  UpdateServiceOrderInput,
} from '../validators/service-orders.validator';
import type {
  ServiceOrderDTO,
  ServiceOrderDetailDTO,
  ServiceOrderEventDTO,
  ServiceOrderLineDTO,
  ServiceOrderLineRow,
  ServiceOrderReportDTO,
} from '../types/service-orders.types';

const opt = <T>(v: T | null | undefined): T | undefined => (v == null ? undefined : v);

/** Money visibility (19 §3, decided 2026-07-23): technician-facing responses
 *  omit line and unit prices **entirely** — not zeroed, not masked, absent. A
 *  technician reaches an order through their assigned work; what it sold for is
 *  none of the field's business.
 *
 *  Stated as the positive back-office allow-list (`isBackOfficeTier`) rather
 *  than `role !== 'technician'`, so a role added later is excluded by default. */
const canSeeMoney = (user: AuthUser) => isBackOfficeTier(user);

const toLineDTO = (row: ServiceOrderLineRow, showMoney: boolean): ServiceOrderLineDTO => ({
  id: row.id,
  serviceId: row.serviceId,
  serviceName: row.serviceName,
  uom: row.uom,
  taxRate: row.taxRate,
  quantity: row.quantity,
  unitPrice: showMoney ? row.unitPrice : undefined,
  amounts: showMoney
    ? lineAmounts({ unitPrice: row.unitPrice, quantity: row.quantity, taxRate: row.taxRate })
    : undefined,
});

/** Progress counts as `countReportsForOrders` hands them back. An order absent
 *  from the grouped result has no live non-cancelled reports — both counts 0. */
type ReportCounts = { total: number; finished: number };

const toOrderDTO = (
  header: OrderHeaderRow,
  lines: ServiceOrderLineRow[],
  counts: ReportCounts | undefined,
  showMoney: boolean,
): ServiceOrderDTO => ({
  id: header.id,
  folio: header.folio,
  customerId: header.customerId,
  customerName: header.customerName,
  quotationId: opt(header.quotationId),
  location: opt(header.location),
  priority: header.priority,
  promisedDate: opt(header.promisedDate),
  status: header.status,
  comments: opt(header.comments),
  servicesCount: lines.length,
  reportsTotal: counts?.total ?? 0,
  reportsFinished: counts?.finished ?? 0,
  amounts: showMoney ? orderAmounts(lines) : undefined,
  createdBy: header.createdBy,
  createdByName: header.createdByName || undefined,
  createdAt: header.createdAt.toISOString(),
  updatedAt: header.updatedAt.toISOString(),
});

export const getServiceOrders = async (
  db: Db,
  user: AuthUser,
  q: ListServiceOrdersQuery,
): Promise<{ items: ServiceOrderDTO[]; total: number }> => {
  const { items, total } = await listServiceOrders(
    db,
    {
      customerId: q.customerId,
      status: q.status,
      priority: q.priority,
      overdue: q.overdue === 'true',
      search: q.q,
    },
    q.page,
    q.limit,
  );
  // One follow-up query for the whole page's lines, then count and total in TS
  // — exact cents, and no CASE ladder over tax rates in SQL. The progress
  // counts ride the same pattern: one grouped query per page (CP-2b).
  const orderIds = items.map((o) => o.id);
  const lines = await listLinesForOrders(db, orderIds);
  const byOrder = new Map<string, ServiceOrderLineRow[]>();
  for (const line of lines) {
    const bucket = byOrder.get(line.serviceOrderId);
    if (bucket) bucket.push(line);
    else byOrder.set(line.serviceOrderId, [line]);
  }
  const counts = await countReportsForOrders(db, orderIds);
  const countsByOrder = new Map(counts.map((c) => [c.serviceOrderId, c]));

  const showMoney = canSeeMoney(user);
  return {
    items: items.map((header) =>
      toOrderDTO(header, byOrder.get(header.id) ?? [], countsByOrder.get(header.id), showMoney),
    ),
    total,
  };
};

export const getServiceOrderById = async (
  db: Db,
  user: AuthUser,
  id: string,
): Promise<ServiceOrderDetailDTO | null> => {
  const header = await findServiceOrderById(db, id);
  if (!header) return null;

  const lines = await listOrderLines(db, id);
  const [counts] = await countReportsForOrders(db, [id]);
  const showMoney = canSeeMoney(user);

  // Lines only. The exploded reports are lazy-loaded via GET /:id/reports
  // (decided 2026-07-27), and no `visits` key in CP-1 — the visits table
  // doesn't exist yet (PR #97 closed unmerged); CP-3 adds it order-bound.
  return {
    ...toOrderDTO(header, lines, counts, showMoney),
    lines: lines.map((line) => toLineDTO(line, showMoney)),
  };
};

/** The order view's reports card (19 §4, lazy — decided 2026-07-27). Null when
 *  the order doesn't exist, so the controller can 404 instead of serving an
 *  empty list for a wrong id. */
export const getServiceOrderReports = async (
  db: Db,
  id: string,
): Promise<ServiceOrderReportDTO[] | null> => {
  const header = await findServiceOrderById(db, id);
  if (!header) return null;
  return listOrderReports(db, id);
};

export const getServiceOrderTimeline = async (
  db: Db,
  id: string,
  page: number,
  limit: number,
): Promise<{ items: ServiceOrderEventDTO[]; total: number } | null> => {
  // 404 on a missing order rather than an empty feed: an order with no timeline
  // is impossible (creation always writes one), so empty would only ever mean
  // "wrong id".
  const header = await findServiceOrderById(db, id);
  if (!header) return null;
  return listOrderEvents(db, id, page, limit);
};

export const addServiceOrder = async (
  db: Db,
  user: AuthUser,
  input: CreateServiceOrderInput,
): Promise<ServiceOrderDetailDTO> => {
  const { order } = await createServiceOrder(db, {
    customerId: input.customerId,
    location: input.location || null,
    comments: input.comments || null,
    priority: input.priority,
    promisedDate: input.promisedDate ?? null,
    lines: input.lines,
    actorId: user.id,
  });
  // Re-read through the detail path so the response is byte-identical to a
  // subsequent GET — the builder navigates straight to the order view.
  const created = await getServiceOrderById(db, user, order.id);
  if (!created) throw new Error('addServiceOrder: created order not readable');
  return created;
};

export const editServiceOrder = async (
  db: Db,
  user: AuthUser,
  id: string,
  input: UpdateServiceOrderInput,
): Promise<ServiceOrderDetailDTO | null> => {
  // `location` is where the crew gets sent, so it is owner/admin-only even
  // though office may edit `comments` on the same request (19 §3).
  if (input.location !== undefined && !isAdminTier(user)) {
    throw new LocationEditForbiddenError();
  }

  const fields: {
    comments?: string | null;
    location?: string | null;
    priority?: ServiceOrderPriority;
    promisedDate?: string | null;
  } = {};
  // Empty string clears the field rather than storing '' — the editor's
  // "remove" sends '' and a stored '' would render as a present-but-blank note.
  if (input.comments !== undefined) fields.comments = input.comments || null;
  if (input.location !== undefined) fields.location = input.location || null;
  // The dispatch pair (CP-2b) is any-staff — no extra gate beyond the route's
  // role list. A null promisedDate withdraws the promise.
  if (input.priority !== undefined) fields.priority = input.priority;
  if (input.promisedDate !== undefined) fields.promisedDate = input.promisedDate;

  const updated = await updateServiceOrder(db, id, fields, user.id);
  if (!updated) return null;
  return getServiceOrderById(db, user, id);
};

export const setServiceOrderStatus = async (
  db: Db,
  user: AuthUser,
  id: string,
  input: SetServiceOrderStatusInput,
): Promise<ServiceOrderDetailDTO | null> => {
  const current = await findServiceOrderById(db, id);
  if (!current) return null;

  // The `open` target is the CP-2b reopen — owner/admin only (a safety valve
  // for a fat-fingered Completar, not a back-office flow), and its repository
  // move is guarded on `completed`, so `cancelled` stays terminal.
  if (input.status === ServiceOrderStatus.Open && !isAdminTier(user)) {
    throw new ReopenForbiddenError();
  }

  const updated =
    input.status === ServiceOrderStatus.Open
      ? await reopenServiceOrder(db, id, user.id, input.note)
      : input.status === ServiceOrderStatus.Completed
        ? await completeServiceOrder(db, id, user.id, input.note)
        : await cancelServiceOrder(db, id, user.id, input.note);

  // Every repository move is guarded on its valid source state inside the
  // UPDATE, so a null here means the order wasn't in it — including the
  // double-submit case where it was a moment ago.
  if (!updated) throw new InvalidOrderTransitionError(current.status, input.status);

  return getServiceOrderById(db, user, id);
};
