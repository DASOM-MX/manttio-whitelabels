import { z } from 'zod';
import { MaterialTracking } from '../enums/materials.enum';

/** Whole integers in v1 (00 §6 #22) held in `numeric(12,3)`. Normalized to a
 *  plain integer string so the column never stores `5.000` for a five. */
const wholeQuantity = z.coerce
  .number()
  .int()
  .nonnegative()
  .max(999_999_999)
  .transform((n) => String(n));

/** GTIN digits — UPC-A, EAN-8, EAN-13, GTIN-14. Stored as text because leading
 *  zeros are significant. */
const upc = z.string().trim().regex(/^\d{8,14}$/);

export const createMaterialSchema = z.object({
  sku: z.string().trim().min(1).max(60).optional(),
  upc: upc.optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000).optional(),
  // Free text (`pza`, `m`, `kg`, …): the UI offers a curated list but does not
  // restrict it (10 §4).
  unit: z.string().trim().min(1).max(20),
  tracking: z.nativeEnum(MaterialTracking),
  minStock: wholeQuantity.optional(),
});

/** `tracking` is accepted here but the service refuses it once the material has
 *  movements (`409 tracking_immutable`) — a material with no history may still
 *  be corrected, which is what the UI's "locks right after create" note means
 *  (05 §3). Nullable fields clear on `null`. */
export const updateMaterialSchema = z.object({
  sku: z.string().trim().min(1).max(60).nullable().optional(),
  upc: upc.nullable().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).nullable().optional(),
  unit: z.string().trim().min(1).max(20).optional(),
  tracking: z.nativeEnum(MaterialTracking).optional(),
  minStock: wholeQuantity.nullable().optional(),
});

/** Paged, unlike the warehouse lists (02 §1/§3): a catalog grows without bound
 *  and the list is a working surface with filters, not a picker. */
export const listMaterialsQuerySchema = z.object({
  search: z.string().trim().min(1).optional(),
  tracking: z.nativeEnum(MaterialTracking).optional(),
  // `?lowStock=true`; anything else is absent rather than false, so a stray
  // value never silently inverts the filter.
  lowStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateMaterialInput = z.infer<typeof createMaterialSchema>;
export type UpdateMaterialInput = z.infer<typeof updateMaterialSchema>;
export type ListMaterialsQuery = z.infer<typeof listMaterialsQuerySchema>;
