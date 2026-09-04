import type { PortalQuotationsQuery } from '../../app/data/dtos/portal-quotation/portal-quotations-query.dto';

export class QuotationsLoadList {
  static readonly type = '[Quotations] Load List';
  constructor(public query: PortalQuotationsQuery = {}) {}
}

export class QuotationsLoadOne {
  static readonly type = '[Quotations] Load One';
  constructor(public id: string) {}
}
