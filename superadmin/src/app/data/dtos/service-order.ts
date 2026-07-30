/** Service-order DTOs (19 §1/§4) — interfaces only; the enums live under
 *  `model/enums/service-order/`. Money fields are **strings** end-to-end (the
 *  backend columns are `numeric(12,2)`; a JSON float would round pesos) and
 *  every one of them is optional: the API omits money wholesale for
 *  technicians (19 §3) — `undefined` means "not visible to me". */

import type { ServiceUom, ServiceTaxRate } from './service';
import type { ReportStatus } from '../../model/enums/report/report-status.enum';
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
  status: ServiceOrderStatus;
  comments?: string;
  servicesCount: number;
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
  lines: CreateServiceOrderLineRequest[];
}

/** The only two mutable fields (19 §1); `location` is owner/admin-only. */
export interface UpdateServiceOrderRequest {
  comments?: string | null;
  location?: string | null;
}

export interface SetServiceOrderStatusRequest {
  status: ServiceOrderStatus.Completed | ServiceOrderStatus.Cancelled;
  /** Recorded on the timeline event — the "why" the handoff document reads. */
  note?: string;
}
