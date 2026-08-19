import type { QuestionDatatype } from './question-datatype.type';
import type { Magnitude } from './magnitude.type';
import type { TemplateColumns } from './template-columns.type';
import { ReportTemplateStatus } from './report-template-status.type';

export interface QuestionConstraints {
  min?: number;
  max?: number;
  maxLength?: number;
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
  unit?: Magnitude;
  constraints?: QuestionConstraints;
}

export interface TemplateSection {
  id: string;
  order: number;
  title: string;
  columns: TemplateColumns;
  questions: TemplateQuestion[];
}

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string | null;
  status: ReportTemplateStatus;
  sections: TemplateSection[];
  disabledReason?: string | null;
  disabledBy?: string | null;
  disabledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReportTemplateListResponse {
  items: ReportTemplate[];
  total: number;
}
