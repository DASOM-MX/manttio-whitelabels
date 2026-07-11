/** Report-template DTOs (06-reports.md §5.1) — the custom report builder.
 *  Lifecycle: draft ⇄ active → disabled (terminal); no versioning in v1. */

export enum TemplateStatus {
  Draft = 'draft',
  Active = 'active',
  Disabled = 'disabled',
}

/** Final nine (decided 2026-07-05). No `photo` — the fixed images block
 *  covers photos. */
export type QuestionDatatype =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'checkbox_group';

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
  constraints?: QuestionConstraints;
  /** Magnitude for `number` questions (06 §5.1 rule, 2026-07-09) — a display
   *  symbol from MAGNITUDE_OPTIONS ('cm', 'V', '°C', …); absent = unitless. */
  unit?: string;
}

export interface TemplateSection {
  id: string;
  order: number;
  title: string;
  /** Per-section desktop/PDF layout; the field app collapses on phones. */
  columns: 1 | 2 | 3;
  questions: TemplateQuestion[];
}

export interface ReportTemplate {
  id: string;
  name: string;
  description?: string;
  status: TemplateStatus;
  sections: TemplateSection[];
  disabledReason?: string;
  disabledBy?: string;
  disabledAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateListQuery {
  page?: number;
  limit?: number;
  status?: TemplateStatus | '';
}

/** Create/update payload — draft-only on the backend; ids optional so new
 *  sections/questions can be minted server-side. */
export interface SaveTemplateRequest {
  name: string;
  description?: string;
  sections: {
    id?: string;
    order: number;
    title: string;
    columns: 1 | 2 | 3;
    questions: {
      id?: string;
      order: number;
      label: string;
      datatype: QuestionDatatype;
      required: boolean;
      options?: string[];
      constraints?: QuestionConstraints;
      unit?: string;
    }[];
  }[];
}
