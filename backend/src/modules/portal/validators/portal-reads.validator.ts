import { z } from 'zod';
import { ContractType, ContractValidity } from '../../contracts/enums/contracts.enum';
import { QuotationStatus } from '../../quotations/enums/quotations.enum';
import { ServiceOrderStatus } from '../../service-orders/enums/service-orders.enum';

// Query params for the five portal read sections (04 §3–§7).
//
// **No `customerId` anywhere, by construction** (02 §4): the scope is the
// token's, so there is no param a URL edit could point at another customer.
// A status filter can only narrow within the released set — the repository
// always ANDs the §2 visibility list on top of it.

const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
};

/** Reportes (04 §3): date range, equipment, free text. */
export const portalReportsQuerySchema = z.object({
  ...pagination,
  search: z.string().trim().min(1).optional(),
  equipmentId: z.string().uuid().optional(),
  /** Both bounds apply to `date_arrival` and are inclusive calendar days —
   *  plain 'YYYY-MM-DD', compared as dates in SQL so no timezone maths can drop
   *  the last day of the range. */
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

/** Contratos (04 §4): type, validity, date range. */
export const portalContractsQuerySchema = z.object({
  ...pagination,
  search: z.string().trim().min(1).optional(),
  type: z.nativeEnum(ContractType).optional(),
  /** Derived from the dates on read, never a stored column (13 §1). */
  validity: z.nativeEnum(ContractValidity).optional(),
  /** Both bounds compare against `valid_from_date`. */
  dateFrom: z.string().date().optional(),
  dateTo: z.string().date().optional(),
});

/** Cotizaciones (04 §5). */
export const portalQuotationsQuerySchema = z.object({
  ...pagination,
  search: z.string().trim().min(1).optional(),
  status: z.nativeEnum(QuotationStatus).optional(),
});

/** Órdenes de servicio (04 §6). No priority filter — priority is not exposed
 *  at all (A15). */
export const portalServiceOrdersQuerySchema = z.object({
  ...pagination,
  search: z.string().trim().min(1).optional(),
  status: z.nativeEnum(ServiceOrderStatus).optional(),
});

/** Equipos (04 §7): free text, location. */
export const portalEquipmentQuerySchema = z.object({
  ...pagination,
  search: z.string().trim().min(1).optional(),
  location: z.string().trim().min(1).optional(),
});

export type PortalReportsQuery = z.infer<typeof portalReportsQuerySchema>;
export type PortalContractsQuery = z.infer<typeof portalContractsQuerySchema>;
export type PortalQuotationsQuery = z.infer<typeof portalQuotationsQuerySchema>;
export type PortalServiceOrdersQuery = z.infer<typeof portalServiceOrdersQuerySchema>;
export type PortalEquipmentQuery = z.infer<typeof portalEquipmentQuerySchema>;
