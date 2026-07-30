import type {
  DeleteServiceRequest,
  SaveServiceRequest,
  ServiceListQuery,
} from '../../app/data/dtos/service';

export class LoadServices {
  static readonly type = '[Services] Load List';
  constructor(public query: ServiceListQuery = {}) {}
}

/** Hydrates the edit form page by id — the list ships whole, but a deep link
 *  or refresh on `/services/:id/edit` has no list to read from. */
export class LoadService {
  static readonly type = '[Services] Load One';
  constructor(public id: string) {}
}

export class CreateService {
  static readonly type = '[Services] Create';
  constructor(public payload: SaveServiceRequest) {}
}

export class UpdateService {
  static readonly type = '[Services] Update';
  constructor(
    public id: string,
    public payload: Partial<SaveServiceRequest>,
  ) {}
}

/** Audited soft delete (18 §1) — the row survives with `deleteComment` +
 *  `deletedBy` stamped, and existing quote/order lines keep their FK. */
export class DeleteService {
  static readonly type = '[Services] Delete';
  constructor(
    public id: string,
    public payload: DeleteServiceRequest,
  ) {}
}
