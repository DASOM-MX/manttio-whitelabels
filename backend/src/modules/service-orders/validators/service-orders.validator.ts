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
  // count. Caps sized to reality (2026-07-27): real orders rarely carry more
  // than ~10 services, so 20 is already generous — and it keeps a fat-fingered
  // quantity from exploding thousands of skeletons in one transaction.
  quantity: z.coerce.number().int().min(1).max(20).default(1),
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
  lines: z
    .array(orderLineSchema)
    .min(1)
    .max(20)
    // One line per service per order — quantity is how you sell more of one
    // thing. The DB unique index enforces this too, but a refine turns the
    // duplicate into a clean 400 instead of a unique-violation 500.
    .refine((lines) => new Set(lines.map((l) => l.serviceId)).size === lines.length, {
      message: 'lines must reference distinct services',
    })
    // The transaction-size backstop: total units bounds the exploded reports
    // (plus their detail rows and timeline events) written in one transaction.
    .refine((lines) => lines.reduce((sum, l) => sum + l.quantity, 0) <= 50, {
      message: 'an order may explode at most 50 reports',
    }),
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

// Paged timeline read (decided 2026-07-27) — same shape as the customer
// interactions feed. The handoff document (CP-5) composes from its own full
// internal read, not from this endpoint, so paging here costs the audit nothing.
export const listTimelineQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

export type CreateServiceOrderInput = z.infer<typeof createServiceOrderSchema>;
export type UpdateServiceOrderInput = z.infer<typeof updateServiceOrderSchema>;
export type SetServiceOrderStatusInput = z.infer<typeof setServiceOrderStatusSchema>;
export type ListServiceOrdersQuery = z.infer<typeof listServiceOrdersQuerySchema>;
export type ListTimelineQuery = z.infer<typeof listTimelineQuerySchema>;
