import type { reportTemplates } from '../models/report-templates.model';
import type { Magnitude, QuestionDatatype } from '../enums/report-templates.enum';

// Doc shapes stored in the `sections` jsonb column (06 §5.1). Server-side
// ids/order are minted/normalized in the service before persisting.
export interface QuestionConstraints {
  min?: number;
  max?: number;
  maxLength?: number;
  /** 'today' or an ISO date. */
  minDate?: string;
  maxDate?: string;
}

export interface TemplateQuestion {
  id: string;
  order: number;
  label: string;
  datatype: QuestionDatatype;
  required: boolean;
  options?: string[];
  /** Number questions only (06 §5.1 rule, 2026-07-09); absent = unitless. */
  unit?: Magnitude;
  constraints?: QuestionConstraints;
}

export interface TemplateSection {
  id: string;
  order: number;
  title: string;
  columns: 1 | 2 | 3;
  questions: TemplateQuestion[];
}

export type ReportTemplateRow = typeof reportTemplates.$inferSelect;
export type NewReportTemplate = typeof reportTemplates.$inferInsert;
