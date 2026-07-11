// Lifecycle (superadmin plan 06 §5.2): draft ⇄ active → disabled (terminal).
// An enum so services compare against named members (`status === TemplateStatus.Draft`)
// rather than magic strings; the string values are what the DB persists.
export enum TemplateStatus {
  Draft = 'draft',
  Active = 'active',
  Disabled = 'disabled',
}

// The final nine datatypes (06 §5.1, decided 2026-07-05). No `photo` — the
// fixed images block covers photos.
export const QUESTION_DATATYPES = [
  'text',
  'textarea',
  'number',
  'date',
  'boolean',
  'select',
  'multiselect',
  'radio',
  'checkbox_group',
] as const;
export type QuestionDatatype = (typeof QUESTION_DATATYPES)[number];

// Magnitude whitelist for number questions (06 §5.1 rule, 2026-07-09). The
// values are display symbols rendered as-is next to the field label (field
// app, PDF); the category grouping is a superadmin presentation concern.
// Absence = unitless — `unit` is only ever accepted on `number` questions.
export const MAGNITUDES = [
  'u',
  'par',
  '%',
  'mm',
  'cm',
  'm',
  'in',
  'ft',
  'mg',
  'g',
  'kg',
  'lb',
  'ml',
  'l',
  'm³',
  'gal',
  'V',
  'A',
  'Ω',
  'W',
  'kW',
  'Hz',
  'psi',
  'bar',
  'kPa',
  '°C',
  '°F',
  'cfm',
  'l/min',
  'm³/h',
  's',
  'min',
  'h',
] as const;
export type Magnitude = (typeof MAGNITUDES)[number];
