import { z } from 'zod';
import { ServiceOrderStatus } from '../enums/service-orders.enum';
import { reportTypes } from '../../reports/enums/reports.enum';

// One sold line. Note what is *absent*: price and tax rate. Both are
// snapshotted from the catalog inside the create transaction (19 §1), so a
// caller cannot post their own price — and when quotations (20) land, the
// snapshot source moves to the accepted quote without this schema changing.
const orderLineSchema = z.object({
  serviceId: z.string().uuid(),
  // Each unit explodes its own report (19 §2), so this is also the report
  // count. Capped to keep one fat-fingered quantity from exploding a thousand
  // skeletons inside a single transaction.
  quantity: z.coerce.number().int().min(1).max(100).default(1),
  // Explosion inputs, captured per line so the skeletons are born complete
  // (19 §2 — the report invariants are kept, not relaxed).
  technicianId: z.string().uuid(),
  reportType: z.enum(reportTypes),
});

export const createServiceOrderSchema = z.object({
  customerId: z.string().uuid(),
  location: z.string().trim().optional(),
  comments: z.string().trim().optional(),
  // At least one line: an order with nothing sold is not an order.
  lines: z.array(orderLineSchema).min(1).max(50),
});

// The only two mutable fields (19 §1). `location` carries its own role gate in
// the service layer — owner/admin only, 403 for office — because it is the one
// field that changes where the crew is sent.
//
// `.strict()` matters here: everything else on an order is immutable, and a
// silently-ignored `customerId` in the body would read like it worked.
export const updateServiceOrderSchema = z
  .object({
    comments: z.string().trim().nullable().optional(),
    location: z.string().trim().nullable().optional(),
  })
  .strict()
  .refine((v) => v.comments !== undefined || v.location !== undefined, {
    message: 'at least one field must be provided',
  });

// Status is moved by its own endpoint, never by PATCH. `open` is excluded: it
// is the birth state, and reopening a closed order is not a v1 flow (19 §2 —
// the auto-complete rule is still open, and reopen has no decided semantics).
export const setServiceOrderStatusSchema = z.object({
  status: z.enum([ServiceOrderStatus.Completed, ServiceOrderStatus.Cancelled]),
  // Recorded on the timeline event — "why was this cancelled" is exactly the
  // question the handoff document has to answer later.
  note: z.string().trim().optional(),
});

export const listServiceOrdersQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(ServiceOrderStatus).optional(),
  /** Folio search — a prefix match on `OS-…`. */
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type CreateServiceOrderInput = z.infer<typeof createServiceOrderSchema>;
export type UpdateServiceOrderInput = z.infer<typeof updateServiceOrderSchema>;
export type SetServiceOrderStatusInput = z.infer<typeof setServiceOrderStatusSchema>;
export type ListServiceOrdersQuery = z.infer<typeof listServiceOrdersQuerySchema>;
