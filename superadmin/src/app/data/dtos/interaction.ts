import type { InteractionRefKind } from '../../model/enums/interaction/interaction-ref-kind.enum';

/** Interaction — the append-only per-client activity timeline (08 §2).
 *  Status changes emit `system` entries server-side; the timeline IS the
 *  status history. No editing or deleting in v1. */

export type InteractionType = 'note' | 'call' | 'whatsapp' | 'email' | 'visit' | 'system';

export interface InteractionRef {
  kind: InteractionRefKind;
  id: string;
}

export interface Interaction {
  id: string;
  customerId: string;
  type: InteractionType;
  body: string;
  ref?: InteractionRef;
  userId: string;
  userName?: string;
  createdAt: string;
}

/** Timeline read (08 §4). `refKind`/`refId` narrow the feed to one linked
 *  entity's trail — the read behind an entity's own audit card (13 §6), where
 *  paging the whole client history would bury the entries it wants. */
export interface InteractionListQuery {
  page?: number;
  limit?: number;
  refKind?: InteractionRefKind;
  refId?: string;
}

/** Manual types only — the backend rejects `system` (08 §4). */
export interface AddInteractionRequest {
  type: Exclude<InteractionType, 'system'>;
  body: string;
}

/** `POST /customers/:id/status` (08 §4): dedicated transition endpoint so the
 *  backend audits transitions and emits the system timeline entry. */
export interface ChangeStatusRequest {
  status: string;
  reason?: string;
  nextFollowUpAt?: string;
}
