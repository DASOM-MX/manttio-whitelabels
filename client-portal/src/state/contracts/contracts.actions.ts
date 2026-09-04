import type { PortalContractsQuery } from '../../app/data/dtos/portal-contract/portal-contracts-query.dto';

export class ContractsLoadList {
  static readonly type = '[Contracts] Load List';
  constructor(public query: PortalContractsQuery = {}) {}
}

export class ContractsLoadOne {
  static readonly type = '[Contracts] Load One';
  constructor(public id: string) {}
}
