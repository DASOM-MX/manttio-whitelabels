import type { ServiceRequestEventType, ServiceRequestStatus } from '../enums/service-requests.enum';

/**
 * Summary of a service request for the list view.
 */
export interface ServiceRequestSummaryDTO {
  id: string;
  folio: string;
  status: ServiceRequestStatus;
  equipmentId?: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Detail view with the full timeline.
 */
export interface ServiceRequestDetailDTO extends ServiceRequestSummaryDTO {
  contactId: string;
  evidence: string[];
  closedAt?: string;
  /** When the customer withdrew it. Mapped from `deleted_at`, which the cancel
   *  is the only writer of — the reason itself is on the timeline. */
  cancelledAt?: string;
  events: ServiceRequestEventDTO[];
}

/**
 * A single event on the timeline (00 §2: staff attribution omitted).
 *
 * The customer sees what happened (`type`, `note`) and who among their own people
 * acted (`portalUserId`). Staff user ids and internal event metadata (`changes`)
 * are never sent.
 */
export interface ServiceRequestEventDTO {
  seq: number;
  id: string;
  type: ServiceRequestEventType;
  portalUserId?: string;
  note?: string;
  createdAt: string;
}
