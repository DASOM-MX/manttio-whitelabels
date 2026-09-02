import type { EquipmentRow } from '../../equipment/types/equipment.types';
import type {
  PortalEquipmentDetail,
  PortalEquipmentListItem,
} from '../dtos/portal-equipment.dto';
import type {
  PortalEquipmentDetailExtras,
  PortalEquipmentListExtras,
} from '../types/portal.types';

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
