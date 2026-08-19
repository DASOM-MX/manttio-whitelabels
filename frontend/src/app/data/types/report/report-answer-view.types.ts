import type { Magnitude } from '../report-template/magnitude.type';
import type {
  QuestionKind,
  QuestionOptionView,
} from '../report-template/report-template-form-view.types';

/** One captured answer flattened for the detail page — everything the markup
 *  needs, resolved once per report instead of per change detection.
 *
 *  Structure always comes from the snapshot (`label`/`kind`/`unit` were frozen at
 *  capture, `06 §5.5`) so a report renders even when its template is long gone.
 *  Options and constraints can only come from the live template, which may no
 *  longer exist — hence they are all optional, and `editable` records the gap. */
export interface AnswerView {
  questionId: string;
  label: string;
  kind: QuestionKind;
  /** Number answers only; rendered as a suffix on the label. */
  unit?: Magnitude;
  /** Read-mode text for single-value answers. `'—'` when unanswered. */
  display: string;
  /** Read-mode chips for `multiselect` / `checkbox_group`. Empty otherwise. */
  values: string[];
  /** Read-mode state for `boolean`. */
  checked: boolean;
  /** Whether edit mode can render a real control for this answer.
   *
   *  Scalar answers always can — the datatype fully determines the control. A
   *  choice answer cannot without its option list, and the snapshot never froze
   *  one: offering a free-text box there would let a technician save a value the
   *  template never allowed. Those stay read-only until the template resolves. */
  editable: boolean;
  options: QuestionOptionView[];

  // Constraints, mirrored from the live template when it is still available.
  required: boolean;
  min?: number;
  max?: number;
  maxLength?: number;
  minDate?: Date;
  maxDate?: Date;
}

/** A captured section flattened for the detail page. */
export interface AnswerSectionView {
  title: string;
  /** Full static Tailwind grid class string — see `GRID_CLASSES`. */
  gridClasses: string;
  answers: AnswerView[];
}
