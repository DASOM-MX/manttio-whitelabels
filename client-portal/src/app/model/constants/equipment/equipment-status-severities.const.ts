import { EquipmentStatus } from '../../enums/equipment/equipment-status.enum';

export const EQUIPMENT_STATUS_SEVERITIES: Record<EquipmentStatus, 'success' | 'secondary'> = {
  [EquipmentStatus.Active]: 'success',
  [EquipmentStatus.Retired]: 'secondary',
};
