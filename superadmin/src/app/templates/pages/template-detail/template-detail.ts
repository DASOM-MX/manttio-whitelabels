import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
import { SlicePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormGroup,
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { CheckboxModule } from 'primeng/checkbox';
import { TagModule } from 'primeng/tag';
import { ConfirmationService, MessageService } from 'primeng/api';
import {
  LucideArrowLeft,
  LucideChevronDown,
  LucideChevronUp,
  LucidePlus,
  LucideTrash2,
} from '@lucide/angular';
import { select, Store } from '@ngxs/store';
import { ReportTemplatesState } from '../../../../state/report-templates/report-templates.state';
import {
  ActivateTemplate,
  CreateTemplate,
  DeactivateTemplate,
  LoadTemplate,
  UpdateTemplate,
} from '../../../../state/report-templates/report-templates.actions';
import { TEMPLATE_STATUS_LABELS } from '../../../model/constants/report-template/template-status-labels.const';
import { TEMPLATE_STATUS_SEVERITIES } from '../../../model/constants/report-template/template-status-severities.const';
import { DATATYPE_OPTIONS } from '../../../model/constants/report-template/datatype-options.const';
import { OPTION_DATATYPES } from '../../../model/constants/report-template/option-datatypes.const';
import { DisableTemplateDialog } from '../../components/disable-template-dialog/disable-template-dialog';
import { FormArrayPipe } from '../../../pipes/cast.pipe';
import { HasOptionsPipe } from '../../../pipes/question-datatype.pipe';
import { ColumnsGridPipe } from '../../../pipes/report-answer.pipe';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import type {
  QuestionDatatype,
  ReportTemplate,
  SaveTemplateRequest,
} from '../../../data/dtos/report-template';

/** The template builder (06 §5.3): section editor + nested question editor +
 *  live full-skeleton preview. Draft-only editing — active/disabled open
 *  read-only; "Editar" on an active template offers the pull-to-draft
 *  transition (§5.2, no versioning in v1). */
@Component({
  selector: 'app-template-detail',
  imports: [
    RouterLink,
    ReactiveFormsModule,
    InputTextModule,
    SelectModule,
    CheckboxModule,
    TagModule,
    SlicePipe,
    FormArrayPipe,
    HasOptionsPipe,
    ColumnsGridPipe,
    DisableTemplateDialog,
    LucideArrowLeft,
    LucidePlus,
    LucideTrash2,
    LucideChevronUp,
    LucideChevronDown,
  ],
  templateUrl: './template-detail.html',
})
export class TemplateDetail implements HasPendingChanges {
  private fb = inject(FormBuilder);
  private store = inject(Store);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private messages = inject(MessageService);
  private confirmation = inject(ConfirmationService);

  protected readonly DATATYPE_OPTIONS = DATATYPE_OPTIONS;

  protected selected = select(ReportTemplatesState.selected);

  protected templateId: string | null = this.route.snapshot.paramMap.get('id');
  protected isNew = !this.templateId;
  protected busy = signal(false);

  protected disableDialog = viewChild<DisableTemplateDialog>('disableDialog');

  protected form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    sections: this.fb.array<FormGroup>([]),
  });

  /** Live preview reads the whole form as a signal. */
  private formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  protected status = computed(() => (this.isNew ? 'draft' : (this.selected()?.status ?? 'draft')));
  protected readOnly = computed(() => this.status() !== 'draft');

  protected statusLabel = computed(() => TEMPLATE_STATUS_LABELS[this.status()]);
  protected statusSeverity = computed(() => TEMPLATE_STATUS_SEVERITIES[this.status()]);

  /** Preview model: sections with parsed questions, in form order. */
  protected preview = computed(() => {
    this.formValue(); // dependency — FormArray mutations re-emit valueChanges
    return this.sections.controls.map((section) => {
      const s = section.getRawValue() as {
        title: string;
        columns: 1 | 2 | 3;
        questions: { label: string; datatype: QuestionDatatype; required: boolean }[];
      };
      return {
        title: s.title || 'Sección sin título',
        columns: Number(s.columns) as 1 | 2 | 3,
        questions: s.questions.map((q) => ({
          label: q.label || 'Pregunta sin título',
          datatype: q.datatype,
          required: q.required,
        })),
      };
    });
  });

  constructor() {
    if (this.templateId) {
      this.store.dispatch(new LoadTemplate(this.templateId));
    } else {
      this.addSection();
    }

    effect(() => {
      const tpl = this.selected();
      if (tpl && this.templateId === tpl.id) this.hydrate(tpl);
    });

    effect(() => {
      if (this.readOnly()) this.form.disable({ emitEvent: false });
      else this.form.enable({ emitEvent: false });
    });
  }

  hasPendingChanges(): boolean {
    return this.form.dirty && !this.busy() && !this.readOnly();
  }

  // ── Form plumbing ────────────────────────────────────────────────────────

  get sections(): FormArray<FormGroup> {
    return this.form.controls.sections;
  }

  protected questionsOf(section: AbstractControl): FormArray<FormGroup> {
    return (section as FormGroup).controls['questions'] as FormArray<FormGroup>;
  }

  protected addSection(initial?: { title?: string; columns?: 1 | 2 | 3 }): void {
    this.sections.push(
      this.fb.nonNullable.group({
        id: [''],
        title: [initial?.title ?? '', Validators.required],
        columns: [initial?.columns ?? (1 as 1 | 2 | 3)],
        questions: this.fb.array<FormGroup>([]),
      }),
    );
    if (!initial) this.form.markAsDirty();
  }

  protected addQuestion(
    section: AbstractControl,
    initial?: {
      label?: string;
      datatype?: QuestionDatatype;
      required?: boolean;
      options?: string[];
      constraints?: {
        min?: number;
        max?: number;
        maxLength?: number;
        minDate?: string;
        maxDate?: string;
      };
    },
  ): void {
    this.questionsOf(section).push(
      this.fb.nonNullable.group({
        id: [''],
        label: [initial?.label ?? '', Validators.required],
        datatype: [initial?.datatype ?? ('text' as QuestionDatatype)],
        required: [initial?.required ?? false],
        optionsCsv: [initial?.options?.join(', ') ?? ''],
        min: [initial?.constraints?.min ?? (null as number | null)],
        max: [initial?.constraints?.max ?? (null as number | null)],
        maxLength: [initial?.constraints?.maxLength ?? (null as number | null)],
        minDate: [initial?.constraints?.minDate ?? ''],
        maxDate: [initial?.constraints?.maxDate ?? ''],
      }),
    );
    if (!initial) this.form.markAsDirty();
  }

  protected move(array: FormArray, index: number, delta: -1 | 1): void {
    const target = index + delta;
    if (target < 0 || target >= array.length) return;
    const ctrl = array.at(index);
    array.removeAt(index);
    array.insert(target, ctrl);
    this.form.markAsDirty();
  }

  protected removeAt(array: FormArray, index: number): void {
    array.removeAt(index);
    this.form.markAsDirty();
  }

  protected setColumns(section: AbstractControl, columns: 1 | 2 | 3): void {
    if (this.readOnly()) return;
    (section as FormGroup).controls['columns'].setValue(columns);
    this.form.markAsDirty();
  }

  // ── Persistence + lifecycle ──────────────────────────────────────────────

  private buildPayload(): SaveTemplateRequest {
    const raw = this.form.getRawValue();
    return {
      name: raw.name,
      description: raw.description || undefined,
      sections: (raw.sections as Record<string, unknown>[]).map((s, si) => ({
        id: (s['id'] as string) || undefined,
        order: si,
        title: s['title'] as string,
        columns: Number(s['columns']) as 1 | 2 | 3,
        questions: (s['questions'] as Record<string, unknown>[]).map((q, qi) => {
          const datatype = q['datatype'] as QuestionDatatype;
          const constraints: Record<string, unknown> = {};
          if (datatype === 'number') {
            if (q['min'] !== null && q['min'] !== '') constraints['min'] = Number(q['min']);
            if (q['max'] !== null && q['max'] !== '') constraints['max'] = Number(q['max']);
          }
          if (datatype === 'text' || datatype === 'textarea') {
            if (q['maxLength']) constraints['maxLength'] = Number(q['maxLength']);
          }
          if (datatype === 'date') {
            if (q['minDate']) constraints['minDate'] = q['minDate'] as string;
            if (q['maxDate']) constraints['maxDate'] = q['maxDate'] as string;
          }
          return {
            id: (q['id'] as string) || undefined,
            order: qi,
            label: q['label'] as string,
            datatype,
            required: !!q['required'],
            options: OPTION_DATATYPES.includes(datatype)
              ? String(q['optionsCsv'] ?? '')
                  .split(',')
                  .map((o) => o.trim())
                  .filter(Boolean)
              : undefined,
            constraints: Object.keys(constraints).length ? constraints : undefined,
          };
        }),
      })),
    };
  }

  protected save(): void {
    if (this.form.invalid || this.busy() || this.readOnly()) return;
    this.busy.set(true);
    const payload = this.buildPayload();
    const action = this.templateId
      ? new UpdateTemplate(this.templateId, payload)
      : new CreateTemplate(payload);
    this.store.dispatch(action).subscribe({
      next: () => {
        this.busy.set(false);
        this.form.markAsPristine();
        this.messages.add({ severity: 'success', summary: 'Borrador guardado' });
        const created = this.store.selectSnapshot(ReportTemplatesState.selected);
        if (!this.templateId && created) {
          this.templateId = created.id;
          this.isNew = false;
          this.router.navigate(['/templates', created.id], { replaceUrl: true });
        }
      },
      error: (err) => {
        this.busy.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo guardar',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  protected activate(): void {
    if (!this.templateId || this.busy()) return;
    if (this.form.dirty) {
      this.messages.add({
        severity: 'warn',
        summary: 'Guarda primero',
        detail: 'Tienes cambios sin guardar en el borrador.',
      });
      return;
    }
    this.confirmation.confirm({
      header: 'Activar plantilla',
      message:
        'La plantilla quedará disponible en la aplicación de campo y los técnicos podrán capturar reportes con ella.',
      acceptLabel: 'Activar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'btn-primary',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () => this.lifecycle(new ActivateTemplate(this.templateId!), 'Plantilla activada'),
    });
  }

  protected deactivate(): void {
    if (!this.templateId || this.busy()) return;
    this.confirmation.confirm({
      header: 'Editar plantilla activa',
      message:
        'Para editarla, la plantilla vuelve a borrador y deja de ofrecerse en la aplicación de campo hasta que la reactives. Los reportes ya capturados no cambian.',
      acceptLabel: 'Pasar a borrador',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'btn-primary',
      rejectButtonStyleClass: 'btn-neutral',
      accept: () =>
        this.lifecycle(new DeactivateTemplate(this.templateId!), 'Plantilla en borrador'),
    });
  }

  protected openDisable(): void {
    const tpl = this.selected();
    if (tpl) this.disableDialog()?.open(tpl);
  }

  private lifecycle(action: object, summary: string): void {
    this.busy.set(true);
    this.store.dispatch(action).subscribe({
      next: () => {
        this.busy.set(false);
        this.messages.add({ severity: 'success', summary });
      },
      error: (err) => {
        this.busy.set(false);
        this.messages.add({
          severity: 'error',
          summary: 'No se pudo cambiar el estado',
          detail: errorMessage(err, 'Inténtalo de nuevo.'),
        });
      },
    });
  }

  private hydrate(tpl: ReportTemplate): void {
    this.form.patchValue(
      { name: tpl.name, description: tpl.description ?? '' },
      { emitEvent: false },
    );
    this.sections.clear({ emitEvent: false });
    for (const s of [...tpl.sections].sort((a, b) => a.order - b.order)) {
      this.addSection({ title: s.title, columns: s.columns });
      const sectionGroup = this.sections.at(this.sections.length - 1);
      sectionGroup.controls['id'].setValue(s.id, { emitEvent: false });
      for (const q of [...s.questions].sort((a, b) => a.order - b.order)) {
        this.addQuestion(sectionGroup, q);
        const qGroup = this.questionsOf(sectionGroup).at(this.questionsOf(sectionGroup).length - 1);
        qGroup.controls['id'].setValue(q.id, { emitEvent: false });
      }
    }
    this.form.markAsPristine();
    // Nudge the preview signal after silent hydration.
    this.form.updateValueAndValidity();
  }
}
