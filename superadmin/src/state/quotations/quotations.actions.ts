import type {
  CancelQuotationRequest,
  CreateQuotationRequest,
  DeleteQuotationRequest,
  QuotationListQuery,
  SendQuotationRequest,
  UpdateQuotationRequest,
} from '../../app/data/dtos/quotation/quotation-requests';

export class LoadQuotations {
  static readonly type = '[Quotations] Load List';
  constructor(public query: QuotationListQuery = {}) {}
}

export class LoadQuotationDetail {
  static readonly type = '[Quotations] Load Detail';
  constructor(public id: string) {}
}

/** The append-only audit trail (20 §5), in insertion order. */
export class LoadQuotationTimeline {
  static readonly type = '[Quotations] Load Timeline';
  constructor(public id: string) {}
}

export class CreateQuotation {
  static readonly type = '[Quotations] Create';
  constructor(public payload: CreateQuotationRequest) {}
}

/** Draft only. Lines are replaced wholesale and re-snapshotted from today's
 *  catalog, so this can move a draft's prices. */
export class UpdateQuotation {
  static readonly type = '[Quotations] Update';
  constructor(
    public id: string,
    public payload: UpdateQuotationRequest,
  ) {}
}

export class SendQuotation {
  static readonly type = '[Quotations] Send';
  constructor(
    public id: string,
    public payload: SendQuotationRequest,
  ) {}
}

/** Opens a new linked draft and cancels this quote. */
export class ReviseQuotation {
  static readonly type = '[Quotations] Revise';
  constructor(public id: string) {}
}

export class CancelQuotation {
  static readonly type = '[Quotations] Cancel';
  constructor(
    public id: string,
    public payload: CancelQuotationRequest,
  ) {}
}

/** Audited soft delete — admin tier. Distinct from cancel: cancelling retires a
 *  quote the client may still be shown, deleting takes it out of the tenant's
 *  lists and stops every mailed link resolving. */
export class DeleteQuotation {
  static readonly type = '[Quotations] Delete';
  constructor(
    public id: string,
    public payload: DeleteQuotationRequest,
  ) {}
}
