import { z } from 'zod';
import { ServiceOrderPriority, ServiceOrderStatus } from '../enums/service-orders.enum';
import { reportTypes } from '../../reports/enums/reports.enum';
import { ServiceTaxRate, ServiceUom } from '../../services/enums/services.enum';

// A calendar date (YYYY-MM-DD) for the `promised_date` column — same shape as
// the quotations validator's `validUntil`. Kept as a string rather than coerced
// through `Date`: parsing "2026-08-01" as a Date lands on UTC midnight, which in
// a negative-offset timezone is the day before — and a promise that silently
// shifts a day is exactly the bug a "fecha compromiso" can't have.
const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Fecha inexistente');

// Money travels as an exact decimal string, never a JSON float — the same
// discipline as every `numeric(12,2)` column (see `order-money.ts`).
const moneyAmount = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Monto inválido (hasta dos decimales, sin signo)');

const decimalQuantity = z
  .string()
  .regex(/^\d{1,9}(\.\d{1,3})?$/, 'Cantidad inválida (hasta tres decimales)')
  .refine((v) => Number(v) > 0, 'La cantidad debe ser mayor a cero');

// One sold line, mirroring `quotation_lines` since line model v2 (2026-07-31).
// A **catalog** line sends only `serviceId` — price and tax rate are
// snapshotted from the catalog inside the create transaction (19 §1), so a
// caller cannot post their own price. An **off-catalog** line sends no
// `serviceId` and supplies name/price/uom/taxRate itself: those fields ARE its
// snapshot.
//
// `quantity` is the MONEY multiplier. `reportCount` is how many report
// skeletons the line explodes — separate since 2026-07-31, because a line of
// 1.5 hours is one job that takes 1.5 hours, not 1.5 jobs. Omit it and the
// server derives the default from the catalog's `isReportSource` flag; send it
// to raise (or zero) the count. `technicianId`/`reportType` are explosion
// inputs, so they are required exactly when the line explodes something — the
// service layer enforces that, where the resolved count is known.
const orderLineSchema = z
  .object({
    serviceId: z.string().uuid().optional(),
    name: z.string().trim().min(1).optional(),
    unitPrice: moneyAmount.optional(),
    uom: z.nativeEnum(ServiceUom).optional(),
    taxRate: z.nativeEnum(ServiceTaxRate).optional(),
    quantity: decimalQuantity.default('1'),
    discountAmount: moneyAmount.optional(),
    // Caps sized to reality (2026-07-27): real orders rarely carry more than
    // ~10 services, and this keeps a fat-fingered count from exploding
    // thousands of skeletons in one transaction.
    reportCount: z.coerce.number().int().min(0).max(20).optional(),
    technicianId: z.string().uuid().optional(),
    reportType: z.enum(reportTypes).optional(),
  })
  .superRefine((line, ctx) => {
    const owned: [keyof typeof line, string][] = [
      ['name', 'nombre'],
      ['unitPrice', 'precio'],
      ['uom', 'unidad'],
      ['taxRate', 'IVA'],
    ];
    for (const [key, label] of owned) {
      if (line.serviceId && line[key] !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `Una partida de catálogo no puede traer ${label} propio — se toma del catálogo.`,
        });
      }
      if (!line.serviceId && line[key] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: `Una partida fuera de catálogo necesita ${label}.`,
        });
      }
    }
  });

export const createServiceOrderSchema = z.object({
  customerId: z.string().uuid(),
  location: z.string().trim().optional(),
  comments: z.string().trim().optional(),
  // The dispatch flags (CP-2b) — both optional at birth: an order defaults to
  // the normal queue with no promise made yet.
  priority: z.nativeEnum(ServiceOrderPriority).default(ServiceOrderPriority.Normal),
  promisedDate: calendarDate.optional(),
  // At least one line: an order with nothing sold is not an order.
  lines: z
    .array(orderLineSchema)
    .min(1)
    .max(20)
    // One line per service per order — quantity is how you sell more of one
    // thing. The DB unique index enforces this too, but a refine turns the
    // duplicate into a clean 400 instead of a unique-violation 500. Off-catalog
    // lines carry no serviceId and are exempt (they never collide).
    .refine((lines) => {
      const ids = lines.flatMap((l) => (l.serviceId ? [l.serviceId] : []));
      return new Set(ids).size === ids.length;
    }, { message: 'lines must reference distinct services' })
    // The transaction-size backstop, now over the EXPLICIT report counts rather
    // than the money quantity. Only bounds what was actually asked for; lines
    // that omit the count are defaulted server-side and re-checked there.
    .refine((lines) => lines.reduce((sum, l) => sum + (l.reportCount ?? 1), 0) <= 50, {
      message: 'an order may explode at most 50 reports',
    }),
});

// The mutable logistics metadata (19 §1, extended by CP-2b): comments, priority
// and promisedDate for any staff; `location` carries its own role gate in the
// service layer — owner/admin only, 403 for office — because it is the one
// field that changes where the crew is sent. A null `promisedDate` withdraws
// the promise.
//
// `.strict()` matters here: everything else on an order is immutable, and a
// silently-ignored `customerId` in the body would read like it worked.
export const updateServiceOrderSchema = z
  .object({
    comments: z.string().trim().nullable().optional(),
    location: z.string().trim().nullable().optional(),
    priority: z.nativeEnum(ServiceOrderPriority).optional(),
    promisedDate: calendarDate.nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      v.comments !== undefined ||
      v.location !== undefined ||
      v.priority !== undefined ||
      v.promisedDate !== undefined,
    { message: 'at least one field must be provided' },
  );

// Status is moved by its own endpoint, never by PATCH. `open` is the CP-2b
// reopen target: owner/admin only (the service gates the role), valid solely
// from `completed` — `cancelled` stays terminal because its cascade voided
// children and un-voiding cannot be done honestly.
export const setServiceOrderStatusSchema = z.object({
  status: z.nativeEnum(ServiceOrderStatus),
  // Recorded on the timeline event — "why was this cancelled" is exactly the
  // question the handoff document has to answer later.
  note: z.string().trim().optional(),
});

export const listServiceOrdersQuerySchema = z.object({
  customerId: z.string().uuid().optional(),
  status: z.nativeEnum(ServiceOrderStatus).optional(),
  priority: z.nativeEnum(ServiceOrderPriority).optional(),
  /** `overdue=true` narrows to open orders whose promise is already broken
   *  (promised_date < today) — the dispatch-board filter (CP-2b). */
  overdue: z.enum(['true', 'false']).optional(),
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
