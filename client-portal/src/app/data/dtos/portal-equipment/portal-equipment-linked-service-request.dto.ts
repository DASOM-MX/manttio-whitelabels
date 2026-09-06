import type { ServiceRequestStatus } from '../../../model/enums/service-request/service-request-status.enum';

/** A request filed against this unit (backend
 *  `PortalEquipmentLinkedServiceRequest`, 04 §7). Only sent when the viewer
 *  holds `create_service_requests` — the array is simply empty otherwise,
 *  which is why the section itself is gated on the same grant rather than
 *  rendered as an empty list. */
export interface PortalEquipmentLinkedServiceRequest {
  id: string;
  folio: string;
  status: ServiceRequestStatus;
  createdAt: string;
}
