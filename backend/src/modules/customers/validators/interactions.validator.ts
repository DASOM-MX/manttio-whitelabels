import { z } from 'zod';
import {
  InteractionRefKind,
  InteractionType,
  MANUAL_INTERACTION_TYPES,
} from '../enums/interactions.enum';
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
//
// `refKind`/`refId` narrow the same timeline to one linked entity — the read
// behind an entity's own audit card (13 §6: a contract's trail lives here, not
// in a table of its own). Without it a card could only page the whole client
// history and hope the entries it wants are on the page it got. The two filter
// independently: `refKind` alone answers "every contract entry for this
// client", both together "this one contract's trail".
export const listInteractionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  refKind: z.nativeEnum(InteractionRefKind).optional(),
  // Deliberately not `.uuid()`: `ref_id` is a text column, so a future ref kind
  // may key on something that isn't one.
  refId: z.string().min(1).max(64).optional(),
});

// Tenant-wide latest-activity feed (utm-params 03, amendment 2026-07-20).
export const recentInteractionsQuerySchema = z.object({
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
export type RecentInteractionsQuery = z.infer<typeof recentInteractionsQuerySchema>;
export type ChangeStatusInput = z.infer<typeof changeStatusSchema>;
