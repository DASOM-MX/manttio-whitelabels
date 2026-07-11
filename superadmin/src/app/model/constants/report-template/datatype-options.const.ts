import { QuestionDatatype } from '../../../data/dtos/report-template';

/** Builder picker options — the final nine datatypes (06 §5.1). */
export const DATATYPE_OPTIONS: { label: string; value: QuestionDatatype }[] = [
  { label: 'Texto', value: QuestionDatatype.Text },
  { label: 'Párrafo', value: QuestionDatatype.Textarea },
  { label: 'Número', value: QuestionDatatype.Number },
  { label: 'Fecha', value: QuestionDatatype.Date },
  { label: 'Sí / No', value: QuestionDatatype.Boolean },
  { label: 'Lista desplegable', value: QuestionDatatype.Select },
  { label: 'Selección múltiple (desplegable)', value: QuestionDatatype.Multiselect },
  { label: 'Opción única (visible)', value: QuestionDatatype.Radio },
  { label: 'Casillas (múltiple, visibles)', value: QuestionDatatype.CheckboxGroup },
];
