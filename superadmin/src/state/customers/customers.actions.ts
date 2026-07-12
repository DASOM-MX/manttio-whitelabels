import type {
  CustomerContact,
  CustomerListQuery,
  DeleteCustomerRequest,
  SaveCustomerRequest,
} from '../../app/data/dtos/customer';

export class LoadCustomers {
  static readonly type = '[Customers] Load List';
  constructor(public query: CustomerListQuery = {}) {}
}

export class LoadCustomer {
  static readonly type = '[Customers] Load One';
  constructor(public id: string) {}
}

export class CreateCustomer {
  static readonly type = '[Customers] Create';
  constructor(public payload: SaveCustomerRequest) {}
}

export class UpdateCustomer {
  static readonly type = '[Customers] Update';
  constructor(
    public id: string,
    public payload: SaveCustomerRequest,
  ) {}
}

export class DeleteCustomer {
  static readonly type = '[Customers] Delete';
  constructor(
    public id: string,
    public payload: DeleteCustomerRequest,
  ) {}
}

export class AddCustomerContact {
  static readonly type = '[Customers] Add Contact';
  constructor(
    public customerId: string,
    public contact: CustomerContact,
  ) {}
}
