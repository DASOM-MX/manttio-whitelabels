import type {
  ContractListQuery,
  CreateContractRequest,
  DeleteContractRequest,
  UpdateContractRequest,
} from '../../app/data/dtos/contract/contract-requests';

export class LoadContracts {
  static readonly type = '[Contracts] Load List';
  constructor(public query: ContractListQuery = {}) {}
}

/** Customer-view contracts card (07 slot) and the order view's card (19 §5). */
export class LoadCustomerContracts {
  static readonly type = '[Contracts] Load By Customer';
  constructor(public customerId: string) {}
}

export class LoadServiceOrderContracts {
  static readonly type = '[Contracts] Load By Service Order';
  constructor(public serviceOrderId: string) {}
}

export class LoadContract {
  static readonly type = '[Contracts] Load Detail';
  constructor(public id: string) {}
}

/** The document rides along — create is one multipart request (13 §5). */
export class CreateContract {
  static readonly type = '[Contracts] Create';
  constructor(
    public payload: CreateContractRequest,
    public file: File,
  ) {}
}

export class UpdateContract {
  static readonly type = '[Contracts] Update';
  constructor(
    public id: string,
    public payload: UpdateContractRequest,
  ) {}
}

/** Swap the stored document — old versions are not kept (13 §1.2). */
export class ReplaceContractFile {
  static readonly type = '[Contracts] Replace File';
  constructor(
    public id: string,
    public file: File,
  ) {}
}

export class DeleteContract {
  static readonly type = '[Contracts] Delete';
  constructor(
    public id: string,
    public payload: DeleteContractRequest,
  ) {}
}
