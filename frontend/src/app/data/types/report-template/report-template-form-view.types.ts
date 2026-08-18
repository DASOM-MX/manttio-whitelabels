import type { Magnitude } from './magnitude.type';

/** One selectable option, precomputed at form-build time so a template never
 *  builds an options array during change detection. */
export interface QuestionOptionView {
  label: string;
  value: string;
}

/** The nine datatypes as a plain string union for view switching.
 *
 *  Mirrors `QuestionDatatype` deliberately: the domain enum stays the enum, but the
 *  template switches on this so the component never has to expose the enum itself
 *  for template access (banned) and never calls a helper per change detection. */
export type QuestionKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'boolean'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'checkbox_group';

/** A template question flattened for rendering: options resolved, `'today'`
 *  already turned into a real date, constraints hoisted out of the nested bag. */
export interface QuestionView {
  id: string;
  label: string;
  kind: QuestionKind;
  required: boolean;
  /** Rendered as a display suffix on the label; number questions only. */
  unit?: Magnitude;
  options: QuestionOptionView[];
  min?: number;
  max?: number;
  minDate?: Date;
  maxDate?: Date;
}

/** A template section flattened for rendering. */
export interface SectionView {
  id: string;
  title: string;
  /** The complete, static Tailwind class string for this section's grid — built
   *  from a fixed lookup so the JIT can see every class it must emit. Never
   *  interpolated (`lg:grid-cols-${n}` would be dropped at build time). */
  gridClasses: string;
  questions: QuestionView[];
}
