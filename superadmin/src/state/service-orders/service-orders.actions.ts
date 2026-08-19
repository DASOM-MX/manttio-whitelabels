import type {
  CreateServiceOrderRequest,
  ServiceOrderListQuery,
  SetServiceOrderStatusRequest,
  UpdateServiceOrderRequest,
} from '../../app/data/dtos/service-order';

export class LoadServiceOrders {
  static readonly type = '[ServiceOrders] Load List';
  constructor(public query: ServiceOrderListQuery = {}) {}
}

export class LoadServiceOrderDetail {
  static readonly type = '[ServiceOrders] Load Detail';
  constructor(public id: string) {}
}

/** The exploded reports — the order view's card lazy-loads them (19 §4). */
export class LoadServiceOrderReports {
  static readonly type = '[ServiceOrders] Load Reports';
  constructor(public id: string) {}
}

/** One page of the newest-first activity feed (19 §7). `append` keeps the
 *  already-shown pages when "Ver más" walks further back (CRM timeline idiom). */
export class LoadServiceOrderTimeline {
  static readonly type = '[ServiceOrders] Load Timeline';
  constructor(
    public id: string,
    public page = 1,
    public append = false,
  ) {}
}

export class CreateServiceOrder {
  static readonly type = '[ServiceOrders] Create';
  constructor(public payload: CreateServiceOrderRequest) {}
}

export class UpdateServiceOrder {
  static readonly type = '[ServiceOrders] Update';
  constructor(
    public id: string,
    public payload: UpdateServiceOrderRequest,
  ) {}
}

export class SetServiceOrderStatus {
  static readonly type = '[ServiceOrders] Set Status';
  constructor(
    public id: string,
    public payload: SetServiceOrderStatusRequest,
  ) {}
}
