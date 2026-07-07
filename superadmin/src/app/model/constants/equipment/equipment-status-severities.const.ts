import type { EquipmentStatus } from '../../../data/dtos/equipment';

export const EQUIPMENT_STATUS_SEVERITIES: Record<EquipmentStatus, 'success' | 'secondary'> = {
  active: 'success',
  retired: 'secondary',
};
