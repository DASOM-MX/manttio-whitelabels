import type { ReportData } from './report-data.dto';

export interface ReportDetailRow {
  reportId: string;
  data: ReportData;
  pictures: string[];
  signature: string | null;
  contentFilledAt: string | null;
  updatedAt: string;
}
