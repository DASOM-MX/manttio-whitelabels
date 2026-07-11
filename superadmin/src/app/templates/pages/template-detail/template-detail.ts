import {
  Component,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  viewChildren,
  type ElementRef,
} from '@angular/core';
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
  LucideChevronRight,
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
import { MAGNITUDE_OPTIONS } from '../../../model/constants/report-template/magnitude-options.const';
import { OPTION_DATATYPES } from '../../../model/constants/report-template/option-datatypes.const';
import { DisableTemplateDialog } from '../../components/disable-template-dialog/disable-template-dialog';
import { FormArrayPipe } from '../../../pipes/cast.pipe';
import { InSetPipe } from '../../../pipes/collection.pipe';
import { HasOptionsPipe } from '../../../pipes/question-datatype.pipe';
import { ColumnsGridPipe } from '../../../pipes/report-answer.pipe';
import { errorMessage } from '../../../data/utils';
import type { HasPendingChanges } from '../../../guards/pending-changes.guard';
import { QuestionDatatype, TemplateStatus } from '../../../data/dtos/report-template';
import type {
  QuestionConstraints,
  ReportTemplate,
  SaveTemplateRequest,
} from '../../../data/dtos/report-template';

type Tab = 'editor' | 'preview';

/** Optional seed for a new or hydrated section row in the builder form. */
interface SectionSeed {
  title?: string;
  columns?: 1 | 2 | 3;
}

/** Optional seed for a new or hydrated question row in the builder form. */
interface QuestionSeed {
  label?: string;
  datatype?: QuestionDatatype;
  required?: boolean;
  options?: string[];
  unit?: string;
  constraints?: QuestionConstraints;
}

/** Raw values read off the section/question FormGroups for the live preview. */
interface QuestionFormValue {
  label: string;
  datatype: QuestionDatatype;
  required: boolean;
  unit: string;
}
interface SectionFormValue {
  title: string;
  columns: 1 | 2 | 3;
  questions: QuestionFormValue[];
}

/** The template builder (06 §5.3): section editor + nested question editor +
 *  full-skeleton preview on its own tab (QA 2026-07-09 — was side-by-side).
 *  Draft-only editing — active/disabled open read-only; "Editar" on an
 *  active template offers the pull-to-draft transition (§5.2, no versioning
 *  in v1). */
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
    InSetPipe,
    LucideArrowLeft,
    LucidePlus,
    LucideTrash2,
    LucideChevronUp,
    LucideChevronDown,
    LucideChevronRight,
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
  protected readonly MAGNITUDE_OPTIONS = MAGNITUDE_OPTIONS;

  protected selected = select(ReportTemplatesState.selected);

  protected templateId: string | null = this.route.snapshot.paramMap.get('id');
  protected isNew = !this.templateId;
  protected busy = signal(false);

  protected readonly TAB_ORDER: readonly Tab[] = ['editor', 'preview'];
  protected tab = signal<Tab>('editor');
  private tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  /** Accordion state (QA 2026-07-09: titles always visible, the rest folds),
   *  keyed by control instance so it survives reorders. User-added
   *  sections/questions open expanded; hydrated ones start collapsed. */
  protected expandedSections = signal<ReadonlySet<AbstractControl>>(new Set());
  protected expandedQuestions = signal<ReadonlySet<AbstractControl>>(new Set());

  protected disableDialog = viewChild<DisableTemplateDialog>('disableDialog');

  protected form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    description: [''],
    sections: this.fb.array<FormGroup>([]),
  });

  /** Live preview reads the whole form as a signal. */
  private formValue = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  protected status = computed(() =>
    this.isNew ? TemplateStatus.Draft : (this.selected()?.status ?? TemplateStatus.Draft),
  );
  protected readOnly = computed(() => this.status() !== TemplateStatus.Draft);

  protected isDraft = computed(() => this.status() === TemplateStatus.Draft);
  protected isActive = computed(() => this.status() === TemplateStatus.Active);
  protected isDisabled = computed(() => this.status() === TemplateStatus.Disabled);

  protected statusLabel = computed(() => TEMPLATE_STATUS_LABELS[this.status()]);
  protected statusSeverity = computed(() => TEMPLATE_STATUS_SEVERITIES[this.status()]);

  /** Preview model: sections with parsed questions, in form order. */
  protected preview = computed(() => {
    this.formValue(); // dependency — FormArray mutations re-emit valueChanges
    return this.sections.controls.map((section) => {
      const s = section.getRawValue() as SectionFormValue;
      return {
        title: s.title || 'Sección sin título',
        columns: Number(s.columns) as 1 | 2 | 3,
        questions: s.questions.map((q) => ({
          label: q.label || 'Pregunta sin título',
          datatype: q.datatype,
          required: q.required,
          unit: q.datatype === QuestionDatatype.Number ? q.unit : '',
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

  /** ARIA tabs pattern: arrow keys / Home / End move + activate + focus. */
  protected onTabKeydown(event: KeyboardEvent): void {
    const current = this.TAB_ORDER.indexOf(this.tab());
    let next: number;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = (current + 1) % this.TAB_ORDER.length;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = (current - 1 + this.TAB_ORDER.length) % this.TAB_ORDER.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = this.TAB_ORDER.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.tab.set(this.TAB_ORDER[next]);
    this.tabButtons()[next]?.nativeElement.focus();
  }

  // ── Form plumbing ────────────────────────────────────────────────────────

  get sections(): FormArray<FormGroup> {
    return this.form.controls.sections;
  }

  protected questionsOf(section: AbstractControl): FormArray<FormGroup> {
    return (section as FormGroup).controls['questions'] as FormArray<FormGroup>;
  }

  /** Immutable Set toggle — the InSetPipe is pure, so state must be replaced. */
  private toggleIn<T>(set: ReadonlySet<T>, item: T): ReadonlySet<T> {
    const next = new Set(set);
    if (next.has(item)) next.delete(item);
    else next.add(item);
    return next;
  }

  protected toggleSection(section: AbstractControl): void {
    this.expandedSections.update((set) => this.toggleIn(set, section));
  }

  protected toggleQuestion(question: AbstractControl): void {
    this.expandedQuestions.update((set) => this.toggleIn(set, question));
  }

  protected addSection(initial?: SectionSeed): void {
    const group = this.fb.nonNullable.group({
      id: [''],
      title: [initial?.title ?? '', Validators.required],
      columns: [initial?.columns ?? (1 as 1 | 2 | 3)],
      questions: this.fb.array<FormGroup>([]),
    });
    this.sections.push(group);
    if (!initial) {
      this.form.markAsDirty();
      this.expandedSections.update((set) => this.toggleIn(set, group));
    }
  }

  protected addQuestion(section: AbstractControl, initial?: QuestionSeed): void {
    const group = this.fb.nonNullable.group({
      id: [''],
      label: [initial?.label ?? '', Validators.required],
      datatype: [initial?.datatype ?? QuestionDatatype.Text],
      required: [initial?.required ?? false],
      optionsCsv: [initial?.options?.join(', ') ?? ''],
      unit: [initial?.unit ?? ''],
      min: [initial?.constraints?.min ?? (null as number | null)],
      max: [initial?.constraints?.max ?? (null as number | null)],
      maxLength: [initial?.constraints?.maxLength ?? (null as number | null)],
      minDate: [initial?.constraints?.minDate ?? ''],
      maxDate: [initial?.constraints?.maxDate ?? ''],
    });
    this.questionsOf(section).push(group);
    if (!initial) {
      this.form.markAsDirty();
      this.expandedQuestions.update((set) => this.toggleIn(set, group));
    }
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
          if (datatype === QuestionDatatype.Number) {
            if (q['min'] !== null && q['min'] !== '') constraints['min'] = Number(q['min']);
            if (q['max'] !== null && q['max'] !== '') constraints['max'] = Number(q['max']);
          }
          if (datatype === QuestionDatatype.Text || datatype === QuestionDatatype.Textarea) {
            if (q['maxLength']) constraints['maxLength'] = Number(q['maxLength']);
          }
          if (datatype === QuestionDatatype.Date) {
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
            // Magnitude is number-only; switching datatype drops a stale unit.
            unit: datatype === QuestionDatatype.Number && q['unit'] ? (q['unit'] as string) : undefined,
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
