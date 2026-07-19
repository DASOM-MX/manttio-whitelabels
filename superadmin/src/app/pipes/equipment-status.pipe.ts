import { Pipe, PipeTransform } from '@angular/core';
import { EQUIPMENT_STATUS_LABELS } from '../model/constants/equipment/equipment-status-labels.const';
import { EQUIPMENT_STATUS_SEVERITIES } from '../model/constants/equipment/equipment-status-severities.const';
import type { EquipmentStatus } from '../data/dtos/equipment';

@Pipe({ name: 'equipmentStatusLabel' })
export class EquipmentStatusLabelPipe implements PipeTransform {
  transform(status: EquipmentStatus): string {
    return EQUIPMENT_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'equipmentStatusSeverity' })
export class EquipmentStatusSeverityPipe implements PipeTransform {
  transform(status: EquipmentStatus): 'success' | 'secondary' {
    return EQUIPMENT_STATUS_SEVERITIES[status];
  }
}
