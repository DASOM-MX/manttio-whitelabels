import type {
  CustomerContact,
  CustomerListQuery,
  DeleteCustomerRequest,
  SaveCustomerRequest,
} from '../../app/data/dtos/customer';
import type { AddInteractionRequest, ChangeStatusRequest } from '../../app/data/dtos/interaction';

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

export class SaveCustomerContacts {
  static readonly type = '[Customers] Save Contacts';
  constructor(
    public id: string,
    public contacts: CustomerContact[],
  ) {}
}

/** 08 §1: every transition goes through the dedicated endpoint. */
export class ChangeCustomerStatus {
  static readonly type = '[Customers] Change Status';
  constructor(
    public id: string,
    public payload: ChangeStatusRequest,
  ) {}
}

/** Set/clear the single follow-up field (08 §3) via the normal PATCH. */
export class SetFollowUp {
  static readonly type = '[Customers] Set Follow-Up';
  constructor(
    public id: string,
    public nextFollowUpAt: string | null,
  ) {}
}

export class LoadInteractions {
  static readonly type = '[Customers] Load Interactions';
  constructor(
    public customerId: string,
    public page = 1,
  ) {}
}

export class AddInteraction {
  static readonly type = '[Customers] Add Interaction';
  constructor(
    public customerId: string,
    public payload: AddInteractionRequest,
  ) {}
}
