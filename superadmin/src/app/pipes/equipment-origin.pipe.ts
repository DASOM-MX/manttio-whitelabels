import { Pipe, PipeTransform } from '@angular/core';
import { EQUIPMENT_ORIGIN_LABELS } from '../model/constants/equipment/equipment-origin-labels.const';
import { EQUIPMENT_ORIGIN_SEVERITIES } from '../model/constants/equipment/equipment-origin-severities.const';
import type { EquipmentOrigin } from '../data/dtos/equipment';

@Pipe({ name: 'equipmentOriginLabel' })
export class EquipmentOriginLabelPipe implements PipeTransform {
  transform(origin: EquipmentOrigin): string {
    return EQUIPMENT_ORIGIN_LABELS[origin];
  }
}

@Pipe({ name: 'equipmentOriginSeverity' })
export class EquipmentOriginSeverityPipe implements PipeTransform {
  transform(origin: EquipmentOrigin): 'success' | 'info' | 'secondary' {
    return EQUIPMENT_ORIGIN_SEVERITIES[origin];
  }
}
