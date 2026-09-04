import { Pipe, PipeTransform } from '@angular/core';
import { REPORT_STATUS_LABELS } from '../model/constants/report/report-status-labels.const';
import { REPORT_STATUS_SEVERITIES } from '../model/constants/report/report-status-severities.const';
import type { ReportStatus } from '../model/enums/report/report-status.enum';

/** Pure per-row status mappings (no method calls in templates). */

@Pipe({ name: 'reportStatusLabel' })
export class ReportStatusLabelPipe implements PipeTransform {
  transform(status: ReportStatus): string {
    return REPORT_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'reportStatusSeverity' })
export class ReportStatusSeverityPipe implements PipeTransform {
  transform(status: ReportStatus): 'secondary' | 'info' | 'success' | 'warn' | 'danger' {
    return REPORT_STATUS_SEVERITIES[status];
  }
}
