import type { ReportStatus } from '../../types/report';

export interface ReportListQuery {
  status?: ReportStatus;
  client_id?: string;
  assigned_to?: string;
  work_type?: string;
  folio?: string;
  date_from?: string;
  date_to?: string;
}
