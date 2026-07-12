import type { DeleteReportRequest, ReportListQuery } from '../../app/data/dtos/report';

export class LoadReports {
  static readonly type = '[Reports] Load List';
  constructor(public query: ReportListQuery = {}) {}
}

export class LoadReport {
  static readonly type = '[Reports] Load One';
  constructor(public id: string) {}
}

export class DeleteReport {
  static readonly type = '[Reports] Delete';
  constructor(
    public id: string,
    public payload: DeleteReportRequest,
  ) {}
}
