import { Component, computed, inject, input, output } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
  type ValidatorFn,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { InputNumberModule } from 'primeng/inputnumber';
import { DatePickerModule } from 'primeng/datepicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SelectModule } from 'primeng/select';
import { MultiSelectModule } from 'primeng/multiselect';
import { RadioButtonModule } from 'primeng/radiobutton';
import { CheckboxModule } from 'primeng/checkbox';
import { ButtonModule } from 'primeng/button';
import type {
  ReportTemplate,
  TemplateSection,
  TemplateQuestion,
} from '../../../data/types/report-template/report-template.types';
import { QuestionDatatype } from '../../../data/types/report-template/question-datatype.type';
import type {
  QuestionView,
  SectionView,
} from '../../../data/types/report-template/report-template-form-view.types';
import type {
  ReportCapture,
  CapturedSection,
  CapturedAnswer,
} from '../../../data/dtos/report/report-capture.dto';

/** Section `columns` (the desktop count) → the full grid class string.
 *
 *  A phone always gets one column: the count is the *ceiling*, not the fixed
 *  layout. Every class is spelled out literally because Tailwind's JIT scans
 *  source text — an interpolated `lg:grid-cols-${n}` would never be emitted.
 *  This lookup is the single seam a future per-breakpoint override extends. */
const GRID_CLASSES: Record<number, string> = {
  1: 'grid grid-cols-1 gap-x-8 gap-y-7',
  2: 'grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-7',
  3: 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-7',
};

/** `'today'` is the one symbolic date the builder can store; resolve it against
 *  the device clock at render. Anything else is an ISO date string. */
const resolveDate = (raw: string | undefined): Date | undefined => {
  if (!raw) return undefined;
  if (raw === 'today') return new Date();
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

@Component({
  selector: 'app-report-template-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    InputTextModule,
    TextareaModule,
    InputNumberModule,
    DatePickerModule,
    ToggleSwitchModule,
    SelectModule,
    MultiSelectModule,
    RadioButtonModule,
    CheckboxModule,
    ButtonModule,
  ],
  templateUrl: './report-template-form.html',
  styleUrl: './report-template-form.scss',
})
export class ReportTemplateForm {
  readonly template = input.required<ReportTemplate>();
  readonly submitForm = output<ReportCapture>();

  private readonly fb = inject(FormBuilder);

  /** Rebuilt whenever the picked template changes. Everything the markup needs is
   *  resolved here — options, grid classes, dates — so the template itself only
   *  reads properties. */
  protected readonly sections = computed<SectionView[]>(() =>
    this.template().sections.map((section: TemplateSection) => ({
      id: section.id,
      title: section.title,
      gridClasses: GRID_CLASSES[section.columns] ?? GRID_CLASSES[1],
      questions: section.questions.map((q) => this.toQuestionView(q)),
    })),
  );

  protected readonly form = computed<FormGroup>(() => {
    const controls: Record<string, unknown> = {};
    for (const section of this.template().sections) {
      for (const q of section.questions) {
        controls[q.id] = [this.initialValue(q), this.validatorsFor(q)];
      }
    }
    return this.fb.group(controls);
  });

  private toQuestionView(q: TemplateQuestion): QuestionView {
    const c = q.constraints ?? {};
    return {
      id: q.id,
      label: q.label,
      kind: q.datatype,
      required: q.required,
      unit: q.datatype === QuestionDatatype.Number ? q.unit : undefined,
      options: (q.options ?? []).map((opt) => ({ label: opt, value: opt })),
      min: c.min,
      max: c.max,
      minDate: resolveDate(c.minDate),
      maxDate: resolveDate(c.maxDate),
    };
  }

  /** Multi-value controls start as an array so the control's value type never
   *  flips between `''` and `string[]` mid-edit. */
  private initialValue(q: TemplateQuestion): unknown {
    if (q.datatype === QuestionDatatype.Multiselect || q.datatype === QuestionDatatype.CheckboxGroup) {
      return [];
    }
    if (q.datatype === QuestionDatatype.Boolean) return false;
    return '';
  }

  private validatorsFor(q: TemplateQuestion): ValidatorFn[] {
    const validators: ValidatorFn[] = [];
    // Forms rule: required by default unless the question says otherwise.
    if (q.required) validators.push(Validators.required);

    const c = q.constraints ?? {};
    switch (q.datatype) {
      case QuestionDatatype.Text:
      case QuestionDatatype.Textarea:
        if (c.maxLength) validators.push(Validators.maxLength(c.maxLength));
        break;
      case QuestionDatatype.Number:
        if (c.min !== undefined) validators.push(Validators.min(c.min));
        if (c.max !== undefined) validators.push(Validators.max(c.max));
        break;
    }
    return validators;
  }

  protected onSubmit(): void {
    if (this.form().invalid) {
      this.form().markAllAsTouched();
      return;
    }
    this.submitForm.emit(this.buildCapture());
  }

  /** Freeze `label` / `datatype` / `unit` alongside each value (06 §5.5): the
   *  report must still render its own questions after the template is edited. */
  private buildCapture(): ReportCapture {
    const form = this.form();
    const sections: CapturedSection[] = this.template().sections.map((section: TemplateSection) => ({
      title: section.title,
      columns: section.columns,
      answers: section.questions.map((q: TemplateQuestion): CapturedAnswer => ({
        questionId: q.id,
        label: q.label,
        datatype: q.datatype,
        unit: q.unit,
        value: form.get(q.id)?.value ?? null,
      })),
    }));

    return {
      templateId: this.template().id,
      templateName: this.template().name,
      sections,
    };
  }
}
