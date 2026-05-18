import type { CreateCustomerRequest, UpdateCustomerRequest } from '../../app/data/dtos/customer';

export class LoadCustomers {
  static readonly type = '[Customers] Load List';
}

export class LoadCustomer {
  static readonly type = '[Customers] Load One';
  constructor(public id: string) {}
}

export class SelectCustomer {
  static readonly type = '[Customers] Select';
  constructor(public id: string | null) {}
}

export class CreateCustomer {
  static readonly type = '[Customers] Create';
  constructor(public payload: CreateCustomerRequest) {}
}

export class UpdateCustomer {
  static readonly type = '[Customers] Update';
  constructor(public id: string, public payload: UpdateCustomerRequest) {}
}

export class DeleteCustomer {
  static readonly type = '[Customers] Delete';
  constructor(public id: string) {}
}
