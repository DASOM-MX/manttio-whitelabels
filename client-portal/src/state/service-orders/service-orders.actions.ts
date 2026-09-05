import type { PortalServiceOrdersQuery } from '../../app/data/dtos/portal-service-order/portal-service-orders-query.dto';

export class ServiceOrdersLoadList {
  static readonly type = '[ServiceOrders] Load List';
  constructor(public query: PortalServiceOrdersQuery = {}) {}
}

export class ServiceOrdersLoadOne {
  static readonly type = '[ServiceOrders] Load One';
  constructor(public id: string) {}
}
