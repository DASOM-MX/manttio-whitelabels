import type {
  DeleteServiceRequest,
  SaveServiceRequest,
  ServiceListQuery,
} from '../../app/data/dtos/service';
import type { ServiceImportRow } from '../../app/data/types/services/service-import';

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

/** The detail page's audit trail (18 §6.1) — dispatched only for owner/admin;
 *  the endpoint 403s every other role. */
export class LoadServiceTimeline {
  static readonly type = '[Services] Load Timeline';
  constructor(public id: string) {}
}

export class CreateService {
  static readonly type = '[Services] Create';
  constructor(public payload: SaveServiceRequest) {}
}

/** CSV import (18 §6.3) — canonical rows, already resolved by the mapper.
 *  All-or-nothing on the server; the page reads the 422 rows on failure. */
export class ImportServices {
  static readonly type = '[Services] Import';
  constructor(public rows: ServiceImportRow[]) {}
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
