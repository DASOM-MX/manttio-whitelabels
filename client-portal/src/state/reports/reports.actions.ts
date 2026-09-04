import type { PortalReportsQuery } from '../../app/data/dtos/portal-report/portal-reports-query.dto';

export class ReportsLoadList {
  static readonly type = '[Reports] Load List';
  constructor(public query: PortalReportsQuery = {}) {}
}

export class ReportsLoadOne {
  static readonly type = '[Reports] Load One';
  constructor(public id: string) {}
}
