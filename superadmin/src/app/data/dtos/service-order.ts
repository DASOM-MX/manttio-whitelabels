/** Service-order DTOs (19 §1/§4) — interfaces only; the enums live under
 *  `model/enums/service-order/`. Money fields are **strings** end-to-end (the
 *  backend columns are `numeric(12,2)`; a JSON float would round pesos) and
 *  every one of them is optional: the API omits money wholesale for
 *  technicians (19 §3) — `undefined` means "not visible to me". */

import type { ServiceUom, ServiceTaxRate } from './service';
import type { ReportStatus } from '../../model/enums/report/report-status.enum';
import type { ServiceOrderPriority } from '../../model/enums/service-order/service-order-priority.enum';
import type { ServiceOrderStatus } from '../../model/enums/service-order/service-order-status.enum';
import type { ServiceOrderEventType } from '../../model/enums/service-order/service-order-event-type.enum';
import type { ServiceOrderEventRefKind } from '../../model/enums/service-order/service-order-event-ref-kind.enum';

export interface MoneyBreakdown {
  subtotal: string;
  tax: string;
  total: string;
}

export interface ServiceOrderLine {
  id: string;
  serviceId: string;
  /** Snapshot frozen at creation — never a live catalog read (19 §1). */
  serviceName: string;
  uom: ServiceUom;
  taxRate: ServiceTaxRate;
  quantity: number;
  unitPrice?: string;
  amounts?: MoneyBreakdown;
}

export interface ServiceOrder {
  id: string;
  folio: string;
  customerId: string;
  customerName: string;
  /** The accepted quotation this order was born from (20 §6); absent on
   *  directly-created orders. */
  quotationId?: string;
  location?: string;
  priority: ServiceOrderPriority;
  /** Date-only `YYYY-MM-DD` "fecha compromiso" (CP-2b); absent when no promise
   *  was made. Overdue = open + promised before today. */
  promisedDate?: string;
  status: ServiceOrderStatus;
  comments?: string;
  servicesCount: number;
  /** Progress counts (CP-2b): finished = finished | mailed, cancelled reports
   *  excluded from both — the denominator is real work, not voided rows. */
  reportsTotal: number;
  reportsFinished: number;
  amounts?: MoneyBreakdown;
  createdBy: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

/** `GET /service-orders/:id` — the order and its lines. Exploded reports and
 *  the timeline load lazily through their own endpoints (19 §4, 2026-07-27). */
export interface ServiceOrderDetail extends ServiceOrder {
  lines: ServiceOrderLine[];
}

/** One exploded report as the order view's reports card lists it. */
export interface ServiceOrderReport {
  id: string;
  folio: string;
  status: ReportStatus;
  reportType: string;
  serviceId: string | null;
  assignedTo: string;
  assignedToName?: string;
  createdAt: string;
}

export interface ServiceOrderEvent {
  id: string;
  type: ServiceOrderEventType;
  actorId?: string;
  actorName?: string;
  ref?: { kind: ServiceOrderEventRefKind; id: string };
  changes?: Record<string, { from: unknown; to: unknown }>;
  note?: string;
  createdAt: string;
}

export interface ServiceOrderListQuery {
  page?: number;
  limit?: number;
  /** Folio prefix search (`OS-…`). */
  q?: string;
  customerId?: string;
  status?: ServiceOrderStatus | '';
  priority?: ServiceOrderPriority | '';
  /** `true` narrows to open orders whose promise already broke (CP-2b). */
  overdue?: boolean;
}

/** One builder line as `POST /service-orders` takes it: the catalog reference
 *  plus the explosion inputs (19 §2) — price and tax are never sent; the
 *  backend freezes them server-side. */
export interface CreateServiceOrderLineRequest {
  serviceId: string;
  quantity: number;
  technicianId: string;
  reportType: string;
}

export interface CreateServiceOrderRequest {
  customerId: string;
  location?: string;
  comments?: string;
  priority?: ServiceOrderPriority;
  /** Date-only `YYYY-MM-DD` (CP-2b). */
  promisedDate?: string;
  lines: CreateServiceOrderLineRequest[];
}

/** The mutable logistics metadata (19 §1 + CP-2b); `location` is
 *  owner/admin-only, the rest any staff. A null `promisedDate` withdraws the
 *  promise. */
export interface UpdateServiceOrderRequest {
  comments?: string | null;
  location?: string | null;
  priority?: ServiceOrderPriority;
  promisedDate?: string | null;
}

/** Complete, cancel, or — CP-2b — reopen: `open` moves a completed order back
 *  (owner/admin only; `cancelled` is terminal). */
export interface SetServiceOrderStatusRequest {
  status: ServiceOrderStatus;
  /** Recorded on the timeline event — the "why" the handoff document reads. */
  note?: string;
}
