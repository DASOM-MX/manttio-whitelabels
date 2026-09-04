import type { PortalEquipmentQuery } from '../../app/data/dtos/portal-equipment/portal-equipment-query.dto';

export class EquipmentLoadList {
  static readonly type = '[Equipment] Load List';
  constructor(public query: PortalEquipmentQuery = {}) {}
}

export class EquipmentLoadOne {
  static readonly type = '[Equipment] Load One';
  constructor(public id: string) {}
}
