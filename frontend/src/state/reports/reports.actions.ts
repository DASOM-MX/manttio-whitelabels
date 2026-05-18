import type {
  ReportListQuery,
  CreateReportFields,
  UpdateReportRequest,
  AddSignatureFields,
  DeletePicturesRequest,
} from '../../app/data/dtos/report';
import type { SendReportEmailRequest } from '../../app/data/dtos/report-email';

export class LoadReports {
  static readonly type = '[Reports] Load List';
}

export class LoadReport {
  static readonly type = '[Reports] Load One';
  constructor(public id: string) {}
}

export class SelectReport {
  static readonly type = '[Reports] Select';
  constructor(public id: string | null) {}
}

export class SetReportsQuery {
  static readonly type = '[Reports] Set Query';
  constructor(public query: ReportListQuery | null) {}
}

export class CreateReport {
  static readonly type = '[Reports] Create';
  constructor(public fields: CreateReportFields) {}
}

export class UpdateReport {
  static readonly type = '[Reports] Update';
  constructor(public id: string, public payload: UpdateReportRequest) {}
}

export class SetAssignee {
  static readonly type = '[Reports] Set Assignee';
  constructor(public id: string, public assignedTo: string) {}
}

export class AddSignature {
  static readonly type = '[Reports] Add Signature';
  constructor(public id: string, public fields: AddSignatureFields) {}
}

export class AddPictures {
  static readonly type = '[Reports] Add Pictures';
  constructor(public id: string, public pictures: File[]) {}
}

export class RemovePictures {
  static readonly type = '[Reports] Remove Pictures';
  constructor(public id: string, public payload: DeletePicturesRequest) {}
}

export class DeleteReport {
  static readonly type = '[Reports] Delete';
  constructor(public id: string) {}
}

export class SendReportEmail {
  static readonly type = '[Reports] Send Email';
  constructor(public id: string, public payload: SendReportEmailRequest) {}
}

export class LoadReportEmails {
  static readonly type = '[Reports] Load Emails';
  constructor(public id: string) {}
}

export class RevokeReportEmail {
  static readonly type = '[Reports] Revoke Email';
  constructor(public emailId: string) {}
}
