import { z } from 'zod';
import { ServiceTaxRate, ServiceUom } from '../enums/services.enum';

// Money in, money out: accepts a JSON number or a numeric string and normalizes
// to the fixed-2 string the `numeric(12,2)` column stores. Rejects negatives,
// NaN/Infinity, and anything past 12 digits of precision.
const money = z.coerce
  .number()
  .finite()
  .nonnegative()
  .max(9_999_999_999.99)
  .transform((n) => n.toFixed(2));

export const createServiceSchema = z.object({
  name: z.string().trim().min(1),
  price: money,
  cost: money.optional(),
  // Closed list — an unknown unit is a 400, not a new de-facto unit.
  uom: z.nativeEnum(ServiceUom),
  description: z.string().optional(),
  websiteDescription: z.string().optional(),
  // An R2 key from `POST /upload/image`, never a URL — the client uploads
  // first and commits the key here on save.
  websiteImageKey: z.string().trim().optional(),
  internalServiceCode: z.string().trim().optional(),
  taxRate: z.nativeEnum(ServiceTaxRate).default(ServiceTaxRate.Iva16),
  // SAT CFDI keys — no format assertion yet; the catalogs are versioned by the
  // SAT and validating against a stale copy would reject valid keys. Facturación
  // (09) owns real validation when it lands.
  satProdServCode: z.string().trim().optional(),
  satUnitCode: z.string().trim().optional(),
  // Defaults true: a catalog service is a job unless the tenant says it is
  // only a charge (19 §2, owner 2026-07-31).
  isReportSource: z.boolean().default(true),
  isListableInWebsite: z.boolean().default(false),
  isPriceVisibleInWebsite: z.boolean().default(false),
  // Clone provenance (18 §6.2): present only when the form was opened as
  // /services/new?from=<id>. Its *presence* is what marks the created event
  // `via: 'clone'` — there is no client-supplied `via`, so nothing arriving on
  // this route can claim to be an import.
  sourceServiceId: z.string().uuid().optional(),
});

// A clone is a birth fact, not an editable field — updates never carry it.
export const updateServiceSchema = createServiceSchema.omit({ sourceServiceId: true }).partial();

/** One CSV import row (18 §6.3) — a plain create with the clone provenance
 *  stripped: an imported row's provenance is the import itself, recorded by
 *  the endpoint, never claimable by the payload. */
export const importServiceRowSchema = createServiceSchema.omit({ sourceServiceId: true });

// The envelope stays loose (`unknown` rows): the service layer validates each
// row individually so the 422 can name every failing row at once, instead of
// zod rejecting the whole body on the first bad one. The 500-row ceiling is a
// named validation error, not a silent cap — real price lists are far smaller,
// and an unbounded array is a request-size hazard on Workers.
export const importServicesSchema = z.object({
  rows: z.array(z.unknown()).min(1).max(500),
});

// Catalog-sized: a search box, no pagination (18 §4).
export const listServicesQuerySchema = z.object({ q: z.string().optional() });

// Audited soft delete, same contract as users/equipment.
export const deleteServiceSchema = z.object({ deleteComment: z.string().min(1) });

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
export type ImportServiceRowInput = z.infer<typeof importServiceRowSchema>;
export type ImportServicesInput = z.infer<typeof importServicesSchema>;
export type ListServicesQuery = z.infer<typeof listServicesQuerySchema>;
export type DeleteServiceInput = z.infer<typeof deleteServiceSchema>;
