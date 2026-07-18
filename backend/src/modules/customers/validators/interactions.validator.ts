import { z } from 'zod';
import { InteractionType, MANUAL_INTERACTION_TYPES } from '../enums/interactions.enum';
import { CustomerStatus } from '../enums/customers.enum';

const MANUAL_TYPES = MANUAL_INTERACTION_TYPES as readonly InteractionType[];

// Manual entries only — the composer never offers `system`, and the API rejects
// it (08 §2/§4). `body` is trimmed non-empty in the service.
export const addInteractionSchema = z.object({
  type: z.nativeEnum(InteractionType).refine((t) => MANUAL_TYPES.includes(t), {
    message: 'system interactions cannot be created',
  }),
  body: z.string().min(1),
});

// Paged, newest-first timeline read (08 §4).
export const listInteractionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// Dedicated status transition (08 §4): the service enforces the legal
// transition + the blacklist-reason rule. `nextFollowUpAt` is an optional
// date-only string (or null to clear).
export const changeStatusSchema = z.object({
  status: z.nativeEnum(CustomerStatus),
  reason: z.string().optional(),
  nextFollowUpAt: z.string().nullable().optional(),
});

export type AddInteractionInput = z.infer<typeof addInteractionSchema>;
export type ListInteractionsQuery = z.infer<typeof listInteractionsQuerySchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
