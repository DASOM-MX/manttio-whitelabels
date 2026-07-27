import type {
  serviceOrderServices,
  serviceOrders,
} from '../models/service-orders.model';
import type { serviceOrderEvents } from '../models/service-order-events.model';
import type {
  ServiceOrderEventRefKind,
  ServiceOrderEventType,
  ServiceOrderStatus,
} from '../enums/service-orders.enum';
import type { ServiceTaxRate, ServiceUom } from '../../services/enums/services.enum';
import type { ReportStatus, ReportType } from '../../reports/enums/reports.enum';

export type ServiceOrderRow = typeof serviceOrders.$inferSelect;
export type NewServiceOrder = typeof serviceOrders.$inferInsert;
export type ServiceOrderLineRow = typeof serviceOrderServices.$inferSelect;
export type NewServiceOrderEvent = typeof serviceOrderEvents.$inferInsert;

/** List filters (19 §4). `search` matches the folio — the one thing people
 *  paste in to find one order. */
export interface ServiceOrderFilters {
  customerId?: string;
  status?: ServiceOrderStatus;
  search?: string;
}

/** One line as the create transaction receives it: the client picks a catalog
 *  service and says how many, who does it and what kind of report it produces.
 *  Price and tax are *not* here — they're snapshotted from the catalog inside
 *  the transaction, so a client can never post their own price. */
export interface OrderLineInput {
  serviceId: string;
  quantity: number;
  technicianId: string;
  reportType: ReportType;
}

/** Money on a line or an order. Every field is a fixed-2 string — `numeric`
 *  keeps exact decimals and a JSON float would not. Absent wholesale for
 *  technicians (19 §3 — technician-facing responses omit money entirely). */
export interface MoneyBreakdown {
  subtotal: string;
  tax: string;
  total: string;
}

export interface ServiceOrderLineDTO {
  id: string;
  serviceId: string;
  /** The snapshot, never a live catalog read — a renamed or soft-deleted
   *  service still shows what was sold (19 §1). */
  serviceName: string;
  uom: ServiceUom;
  taxRate: ServiceTaxRate;
  quantity: number;
  /** Omitted for technicians, along with `amounts`. */
  unitPrice?: string;
  amounts?: MoneyBreakdown;
}

/** One exploded report as `GET /:id/reports` lists it (19 §4 — lazy-loaded by
 *  the order view's reports card, decided 2026-07-27; not embedded in the
 *  detail). Deliberately narrow: the card shows folio, state and who has it —
 *  the report itself is one click away and owns the rest. */
export interface ServiceOrderReportDTO {
  /** The report folio (`R-YYYYMMDD-NNNN`) — reports are keyed by it. */
  id: string;
  folio: string;
  status: ReportStatus;
  reportType: string;
  /** Which line this report fulfills; drives the template prefilter (CP-4). */
  serviceId: string | null;
  assignedTo: string;
  assignedToName?: string;
  createdAt: string;
}

export interface ServiceOrderDTO {
  id: string;
  folio: string;
  customerId: string;
  customerName: string;
  location?: string;
  status: ServiceOrderStatus;
  comments?: string;
  servicesCount: number;
  /** Omitted for technicians (19 §3). */
  amounts?: MoneyBreakdown;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

/** `GET /service-orders/:id` (19 §4): the order and its lines only. Exploded
 *  reports load lazily via `GET /:id/reports` (decided 2026-07-27), and
 *  `visits` is absent in CP-1 by design — the visits backend doesn't exist yet
 *  (PR #97 closed unmerged); CP-3 adds it when it builds them order-bound. */
export interface ServiceOrderDetailDTO extends ServiceOrderDTO {
  lines: ServiceOrderLineDTO[];
}

/** One resolved timeline entry (19 §7) — the order-view activity feed and, at
 *  CP-5, the client handoff document's source. */
export interface ServiceOrderEventDTO {
  id: string;
  type: ServiceOrderEventType;
  actorId?: string;
  actorName?: string;
  ref?: { kind: ServiceOrderEventRefKind; id: string };
  changes?: Record<string, { from: unknown; to: unknown }>;
  note?: string;
  createdAt: string;
}

/** What `createServiceOrder` hands the repository — already validated, with the
 *  catalog snapshot resolved and the actor attached. */
export interface CreateOrderCommand {
  customerId: string;
  location: string | null;
  comments: string | null;
  lines: OrderLineInput[];
  actorId: string;
}
