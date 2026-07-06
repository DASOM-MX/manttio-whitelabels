import type { QuestionDatatype } from '../../../data/dtos/report-template';

/** Builder picker options — the final nine datatypes (06 §5.1). */
export const DATATYPE_OPTIONS: { label: string; value: QuestionDatatype }[] = [
  { label: 'Texto', value: 'text' },
  { label: 'Párrafo', value: 'textarea' },
  { label: 'Número', value: 'number' },
  { label: 'Fecha', value: 'date' },
  { label: 'Sí / No', value: 'boolean' },
  { label: 'Lista desplegable', value: 'select' },
  { label: 'Selección múltiple (desplegable)', value: 'multiselect' },
  { label: 'Opción única (visible)', value: 'radio' },
  { label: 'Casillas (múltiple, visibles)', value: 'checkbox_group' },
];
