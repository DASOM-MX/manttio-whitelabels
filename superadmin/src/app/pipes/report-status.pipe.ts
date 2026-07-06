import { Pipe, PipeTransform } from '@angular/core';
import { REPORT_STATUS_LABELS } from '../model/constants/report/report-status-labels.const';
import { REPORT_STATUS_SEVERITIES } from '../model/constants/report/report-status-severities.const';
import { TEMPLATE_STATUS_LABELS } from '../model/constants/report-template/template-status-labels.const';
import { TEMPLATE_STATUS_SEVERITIES } from '../model/constants/report-template/template-status-severities.const';
import type { ReportStatus } from '../data/dtos/report';
import type { ReportTemplate, TemplateStatus } from '../data/dtos/report-template';

/** Pure per-row status mappings (01 Angular: no method calls in templates). */

@Pipe({ name: 'reportStatusLabel' })
export class ReportStatusLabelPipe implements PipeTransform {
  transform(status: ReportStatus): string {
    return REPORT_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'reportStatusSeverity' })
export class ReportStatusSeverityPipe implements PipeTransform {
  transform(status: ReportStatus): 'secondary' | 'info' | 'success' | 'warn' {
    return REPORT_STATUS_SEVERITIES[status];
  }
}

@Pipe({ name: 'templateStatusLabel' })
export class TemplateStatusLabelPipe implements PipeTransform {
  transform(status: TemplateStatus): string {
    return TEMPLATE_STATUS_LABELS[status];
  }
}

@Pipe({ name: 'templateStatusSeverity' })
export class TemplateStatusSeverityPipe implements PipeTransform {
  transform(status: TemplateStatus): 'secondary' | 'success' | 'danger' {
    return TEMPLATE_STATUS_SEVERITIES[status];
  }
}

@Pipe({ name: 'questionCount' })
export class QuestionCountPipe implements PipeTransform {
  transform(template: ReportTemplate): number {
    return template.sections.reduce((sum, s) => sum + s.questions.length, 0);
  }
}
