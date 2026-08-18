import type { ReportDetail } from './report-detail.dto';

/** The flat detail of a report, replacing the old `{ report, details }` envelope. */
export interface ReportResponse extends ReportDetail {}
