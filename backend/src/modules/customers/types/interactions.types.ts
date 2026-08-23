import type { customerInteractions } from '../models/customer-interactions.model';
import type { CustomerStatus } from '../enums/customers.enum';
import type { InteractionRefKind, InteractionType } from '../enums/interactions.enum';

export type InteractionRow = typeof customerInteractions.$inferSelect;
export type NewInteraction = typeof customerInteractions.$inferInsert;

/** Repository row after the users left-join (author name columns folded in;
 *  the DTO composes the full display name). */
export type InteractionRowWithAuthor = InteractionRow & {
  userName: string | null;
  userPaternalLastName: string | null;
  userMaternalLastName: string | null;
};

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

/** Narrows a timeline read to one linked entity's trail (13 §6) — the read an
 *  entity's own audit card makes. `refKind` alone answers "every contract entry
 *  for this client"; `refId` is only meaningful alongside it, which the query
 *  validator enforces. */
export interface InteractionRefFilter {
  refKind?: InteractionRefKind;
  refId?: string;
}

/** Feed row for the tenant-wide latest-activity read (utm-params 03): the
 *  timeline DTO plus the customer it belongs to, for linking out. The status
 *  rides along since the 2026-07-22 cockpit layout turn (activity table's
 *  Estatus column). */
export interface RecentInteractionDTO extends InteractionDTO {
  customerName: string;
  customerStatus: CustomerStatus;
}

/** A backend-generated `system` entry appended in the same transaction as the
 *  change that caused it (customer create/edit, status change). */
export interface SystemAudit {
  userId: string | null;
  body: string;
  refKind?: InteractionRefKind;
  refId?: string;
}
