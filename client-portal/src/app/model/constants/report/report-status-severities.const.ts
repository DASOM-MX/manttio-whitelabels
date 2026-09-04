import { ReportStatus } from '../../enums/report/report-status.enum';

/** p-tag severities per report status — pills always pair color with a label. */
export const REPORT_STATUS_SEVERITIES: Record<
  ReportStatus,
  'secondary' | 'info' | 'success' | 'warn' | 'danger'
> = {
  [ReportStatus.Pending]: 'warn',
  [ReportStatus.Created]: 'secondary',
  [ReportStatus.InProgress]: 'info',
  [ReportStatus.Finished]: 'success',
  [ReportStatus.Mailed]: 'warn',
  [ReportStatus.Cancelled]: 'danger',
};
