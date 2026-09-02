import type { EquipmentStatus } from '../../equipment/enums/equipment.enum';
import type { EquipmentRow } from '../../equipment/types/equipment.types';
import type { ReportStatus } from '../../reports/enums/reports.enum';

/** A report on this unit, for the per-unit history (04 §7). */
export interface PortalEquipmentLinkedReport {
  id: string;
  reportType: string;
  status: ReportStatus;
  createdAt: Date;
}

/** A request filed against this unit. `status` becomes `ServiceRequestStatus`
 *  once 01 CP-2 lands. */
export interface PortalEquipmentLinkedServiceRequest {
  id: string;
  folio: string;
  status: string;
  createdAt: Date;
}

export interface PortalEquipmentListExtras {
  /** Newest linked report's date; null if never serviced. */
  lastServiceDate: Date | null;
}

/** Each sub-list obeys its own grant (04 §7), so either may be empty because the
 *  user is not entitled to it rather than because there is nothing there. */
export interface PortalEquipmentDetailExtras extends PortalEquipmentListExtras {
  linkedReports: PortalEquipmentLinkedReport[];
  linkedServiceRequests: PortalEquipmentLinkedServiceRequest[];
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
  lastServiceDate: Date | null;
}

/** The identification block plus the per-unit history. */
export interface PortalEquipmentDetail extends PortalEquipmentListItem {
  kind: string | null;
  capacity: string | null;
  installDate: string | null;
  status: EquipmentStatus;
  photos: string[];
  linkedReports: PortalEquipmentLinkedReport[];
  linkedServiceRequests: PortalEquipmentLinkedServiceRequest[];
}

export const toPortalEquipmentListItem = (
  row: EquipmentRow,
  extras: PortalEquipmentListExtras,
): PortalEquipmentListItem => ({
  id: row.id,
  name: row.name,
  brand: row.brand,
  model: row.model,
  serialNumber: row.serialNumber,
  location: row.location,
  lastServiceDate: extras.lastServiceDate,
});

export const toPortalEquipmentDetail = (
  row: EquipmentRow,
  extras: PortalEquipmentDetailExtras,
): PortalEquipmentDetail => ({
  ...toPortalEquipmentListItem(row, extras),
  kind: row.kind,
  capacity: row.capacity,
  installDate: row.installDate,
  status: row.status,
  photos: row.photos,
  linkedReports: extras.linkedReports,
  linkedServiceRequests: extras.linkedServiceRequests,
});
