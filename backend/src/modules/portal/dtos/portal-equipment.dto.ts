import type { EquipmentStatus } from '../../equipment/enums/equipment.enum';
import type { PortalLinkedReport } from './portal-report.dto';

/** A request filed against this unit. `status` becomes `ServiceRequestStatus`
 *  once 01 CP-2 lands. */
export interface PortalEquipmentLinkedServiceRequest {
  id: string;
  folio: string;
  status: string;
  createdAt: string;
}

/** The customer's own registry (04 §7). Acquisition cost, internal maintenance
 *  scheduling and the WMS link are never sent. */
export interface PortalEquipmentListItem {
  id: string;
  name: string | null;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  location: string | null;
  lastServiceDate: string | null;
}

/** The identification block plus the per-unit history. */
export interface PortalEquipmentDetail extends PortalEquipmentListItem {
  kind: string | null;
  capacity: string | null;
  installDate: string | null;
  status: EquipmentStatus;
  photos: string[];
  linkedReports: PortalLinkedReport[];
  linkedServiceRequests: PortalEquipmentLinkedServiceRequest[];
}
