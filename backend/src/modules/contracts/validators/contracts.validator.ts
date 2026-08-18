import { z } from 'zod';
import { ContractType, ContractValidity } from '../enums/contracts.enum';

// `date` columns take plain 'YYYY-MM-DD' strings.
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

// Tags are normalized (trim/lowercase/dedupe) in the service, not here — the
// validator only bounds them.
const tagsSchema = z.array(z.string().min(1).max(40)).max(20);

// Only the non-manager roles are settable: owner/admin always see every
// contract and are not listed (13 §4).
const visibleToRolesSchema = z.array(z.enum(['office', 'technician'])).max(2);

// Array fields arrive as JSON strings over multipart (the reports-create
// precedent), so accept either shape and normalize to the array.
const jsonArray = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }, schema);

/** Metadata half of `POST /contracts` (the file half is the multipart `file`
 *  part, validated by the allowlist). */
export const createContractMetaSchema = z.object({
  customerId: z.string().uuid(),
  serviceOrderId: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  type: z.nativeEnum(ContractType),
  description: z.string().optional(),
  validFromDate: dateString,
  expiryDate: dateString.optional(),
  tags: jsonArray(tagsSchema).optional(),
  visibleToRoles: jsonArray(visibleToRolesSchema).optional(),
});

// PATCH is **metadata only** — the stored document is replaced through
// POST /:id/file so the file fields can never drift apart (they move as one
// unit). `customerId` and `serviceOrderId` are immutable: re-filing a contract
// under a different client would orphan its audit trail.
export const updateContractSchema = z
  .object({
    name: z.string().min(1).max(200),
    type: z.nativeEnum(ContractType),
    description: z.string().nullable(),
    validFromDate: dateString,
    expiryDate: dateString.nullable(),
    tags: tagsSchema,
    visibleToRoles: visibleToRolesSchema,
  })
  .partial();

export const listContractsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  customerId: z.string().uuid().optional(),
  serviceOrderId: z.string().uuid().optional(),
  type: z.nativeEnum(ContractType).optional(),
  // Derived from the dates, not a stored column (13 §1).
  validity: z.nativeEnum(ContractValidity).optional(),
  // Exact-containment tag filter (GIN-backed), vs `search` which ilikes.
  tag: z.string().optional(),
});

// Soft delete carries an audit comment (equipment shape). This is also how
// early termination is recorded — there is no `cancelled` status.
export const deleteContractSchema = z.object({ deleteComment: z.string().min(1) });

export type CreateContractMetaInput = z.infer<typeof createContractMetaSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;
export type DeleteContractInput = z.infer<typeof deleteContractSchema>;
