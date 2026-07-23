import { z } from 'zod';
import { isContractFileMime } from '../constants/contract-file-types';

// `date` columns take plain 'YYYY-MM-DD' strings.
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

// Tags are normalized (trim/lowercase/dedupe) in the service, not here — the
// validator only bounds them.
const tagsSchema = z.array(z.string().min(1).max(40)).max(20);

export const createContractSchema = z.object({
  customerId: z.string().uuid().optional(),
  description: z.string().min(1),
  // The file trio comes verbatim from the POST /upload/contract response.
  fileUrl: z.string().url(),
  fileName: z.string().min(1),
  fileMime: z.string().refine(isContractFileMime, 'unsupported contract file type'),
  fileSize: z.number().int().positive().optional(),
  validationDate: dateString,
  expiryDate: dateString.optional(),
  tags: tagsSchema.optional(),
});

// PATCH: any create field (the file trio included — replacing the document is
// a new upload + patch), plus explicit nulls to unlink the client or clear the
// expiry.
export const updateContractSchema = createContractSchema.partial().extend({
  customerId: z.string().uuid().nullable().optional(),
  expiryDate: dateString.nullable().optional(),
});

export const listContractsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().optional(),
  customerId: z.string().uuid().optional(),
  // Exact-containment tag filter (GIN-backed), vs `search` which ilikes.
  tag: z.string().optional(),
});

// Soft delete carries an audit comment (equipment shape).
export const deleteContractSchema = z.object({ deleteComment: z.string().min(1) });

export type CreateContractInput = z.infer<typeof createContractSchema>;
export type UpdateContractInput = z.infer<typeof updateContractSchema>;
export type ListContractsQuery = z.infer<typeof listContractsQuerySchema>;
export type DeleteContractInput = z.infer<typeof deleteContractSchema>;
