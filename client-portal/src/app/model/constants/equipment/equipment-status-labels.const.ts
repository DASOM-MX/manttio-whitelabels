import { EquipmentStatus } from '../../enums/equipment/equipment-status.enum';

export const EQUIPMENT_STATUS_LABELS: Record<EquipmentStatus, string> = {
  [EquipmentStatus.Active]: 'Activo',
  [EquipmentStatus.Retired]: 'Retirado',
};
