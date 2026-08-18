import type { QuestionDatatype } from '../../types/report-template/question-datatype.type';
import type { Magnitude } from '../../types/report-template/magnitude.type';
import type { TemplateColumns } from '../../types/report-template/template-columns.type';

export interface CapturedAnswer {
  questionId: string;
  label: string; // frozen at capture
  datatype: QuestionDatatype;
  unit?: Magnitude;
  value: string | number | boolean | string[] | null;
}

export interface CapturedSection {
  title: string;
  columns: TemplateColumns;
  answers: CapturedAnswer[];
}

export interface ReportCapture {
  templateId: string;
  templateName: string;
  sections: CapturedSection[];
}
