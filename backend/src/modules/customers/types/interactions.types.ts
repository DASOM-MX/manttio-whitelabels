import type { customerInteractions } from '../models/customer-interactions.model';
import type { InteractionRefKind, InteractionType } from '../enums/interactions.enum';

export type InteractionRow = typeof customerInteractions.$inferSelect;
export type NewInteraction = typeof customerInteractions.$inferInsert;

/** API shape returned to the superadmin (matches its `Interaction` DTO). `ref`
 *  is assembled from the `refKind`/`refId` columns; `userName` is joined from
 *  `users`. `createdAt` serializes to ISO via `c.json`. */
export interface InteractionDTO {
  id: string;
  customerId: string;
  type: InteractionType;
  body: string;
  ref?: { kind: InteractionRefKind; id: string };
  userId: string | null;
  userName?: string;
  createdAt: Date;
}

/** Feed row for the tenant-wide latest-activity read (utm-params 03): the
 *  timeline DTO plus the customer it belongs to, for linking out. */
export interface RecentInteractionDTO extends InteractionDTO {
  customerName: string;
}

/** A backend-generated `system` entry appended in the same transaction as the
 *  change that caused it (customer create/edit, status change). */
export interface SystemAudit {
  userId: string | null;
  body: string;
  refKind?: InteractionRefKind;
  refId?: string;
}
