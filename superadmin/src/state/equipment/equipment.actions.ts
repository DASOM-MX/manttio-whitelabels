import type {
  DeleteEquipmentRequest,
  EquipmentListQuery,
  SaveEquipmentRequest,
} from '../../app/data/dtos/equipment';

export class LoadEquipment {
  static readonly type = '[Equipment] Load List';
  constructor(public query: EquipmentListQuery = {}) {}
}

/** Customer-view equipment card (11 §4). */
export class LoadCustomerEquipment {
  static readonly type = '[Equipment] Load By Customer';
  constructor(public customerId: string) {}
}

export class LoadEquipmentDetail {
  static readonly type = '[Equipment] Load Detail';
  constructor(public id: string) {}
}

export class CreateEquipment {
  static readonly type = '[Equipment] Create';
  constructor(public payload: SaveEquipmentRequest) {}
}

export class UpdateEquipment {
  static readonly type = '[Equipment] Update';
  constructor(
    public id: string,
    public payload: Partial<SaveEquipmentRequest>,
  ) {}
}

/** Retire / reactivate — a unit that stopped being serviced is retired,
 *  never deleted (11 §3). */
export class SetEquipmentStatus {
  static readonly type = '[Equipment] Set Status';
  constructor(
    public id: string,
    public status: 'active' | 'retired',
  ) {}
}

export class LinkReport {
  static readonly type = '[Equipment] Link Report';
  constructor(
    public id: string,
    public reportId: string,
  ) {}
}

export class UnlinkReport {
  static readonly type = '[Equipment] Unlink Report';
  constructor(
    public id: string,
    public reportId: string,
  ) {}
}

export class DeleteEquipment {
  static readonly type = '[Equipment] Delete';
  constructor(
    public id: string,
    public payload: DeleteEquipmentRequest,
  ) {}
}
