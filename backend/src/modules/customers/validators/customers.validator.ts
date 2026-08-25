import { z } from 'zod';
import { MEXICAN_TIMEZONE_VALUES } from '../constants/timezones';
import { ClientType, CustomerSource, CustomerStatus } from '../enums/customers.enum';

// Sub-field formats are enforced client-side; the server stays lenient on the
// optional strings (empty values arrive pruned) and only guards `name`.
const contactSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  isDefault: z.boolean().optional(),
});

const fiscalSchema = z.object({
  rfc: z.string().min(1),
  legalName: z.string().min(1),
  taxRegimeCode: z.string().min(1),
  fiscalZip: z.string().min(1),
  cfdiUseCode: z.string().min(1),
  billingEmail: z.string().optional(),
});

// No `.default()` on the collections: on PATCH an omitted key stays omitted so
// the service leaves the stored value untouched (a defaulted `[]` would wipe
// contacts/tags on a partial update). Create-time defaults come from the DB
// column defaults / the service's default-contact normalization.
// Attribution fields and statusChangedAt are deliberately absent: attribution
// is write-once (public lead insert only), statusChangedAt is service-derived.
export const createCustomerSchema = z.object({
  name: z.string().min(1),
  contactName: z.string().optional(),
  identification: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  observation: z.string().optional(),
  address: z.string().optional(),
  state: z.string().optional(),
  razonSocial: z.string().optional(),
  tags: z.array(z.string()).optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
  source: z.nativeEnum(CustomerSource).optional(),
  clientType: z.nativeEnum(ClientType).optional(),
  contacts: z.array(contactSchema).optional(),
  fiscal: fiscalSchema.optional(),
  timezone: z.enum(MEXICAN_TIMEZONE_VALUES).optional(),
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  // Follow-up date (08 §3) travels on the normal PATCH — a date-only string or
  // null to clear. `status`/`blacklistReason` transitions go through the
  // dedicated POST /:id/status endpoint (audited), not here.
  .extend({ nextFollowUpAt: z.string().nullable().optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

// The clients list read (07 §2, built 21 CP-4). Mirrors listUsersQuerySchema:
// the same page/limit contract every other paged list already answers.
export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Capped so a caller cannot turn the paged list back into a full-table read.
  // The whole roster has its own route (`GET /customers/all`).
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().trim().min(1).optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
  source: z.nativeEnum(CustomerSource).optional(),
  // Arrives comma-joined from the client (`tags=a,b`). Split here rather than
  // in the service so every caller of `ListCustomersQuery` sees a real array
  // and no one has to remember the wire encoding. Empty segments are dropped,
  // so `tags=` and `tags=,,` mean "no tag filter" rather than "match ''".
  tags: z
    .string()
    .optional()
    .transform((v) => {
      const list = (v ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);
      return list.length ? list : undefined;
    }),
});

// Recent-clients card read (utm-params 03 amendment 2026-07-20).
export const recentCustomersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(8),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type RecentCustomersQuery = z.infer<typeof recentCustomersQuerySchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
