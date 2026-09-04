import type { PortalLinkedReport } from '../portal-report/portal-linked-report.dto';
import type { PortalEquipmentLinkedServiceRequest } from './portal-equipment-linked-service-request.dto';
import type { PortalEquipmentListItem } from './portal-equipment-list-item.dto';
import type { EquipmentStatus } from '../../../model/enums/equipment/equipment-status.enum';

/** The identification block plus the per-unit history (backend
 *  `PortalEquipmentDetail`, 04 §7). `linkedReports` is only populated when
 *  the viewer holds `view_reports`, `linkedServiceRequests` only when they
 *  hold `create_service_requests` — each sub-list obeys its own grant, so an
 *  equipment-only user's arrays arrive empty and the matching section must
 *  not render for them (an empty section would misreport "no history" for
 *  someone who was never shown any). Acquisition cost, internal maintenance
 *  scheduling and the WMS link are never sent. */
export interface PortalEquipmentDetail extends PortalEquipmentListItem {
  kind: string | null;
  capacity: string | null;
  installDate: string | null;
  status: EquipmentStatus;
  photos: string[];
  linkedReports: PortalLinkedReport[];
  linkedServiceRequests: PortalEquipmentLinkedServiceRequest[];
}
