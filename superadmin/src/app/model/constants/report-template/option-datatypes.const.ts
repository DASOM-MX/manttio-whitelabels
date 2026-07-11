import { QuestionDatatype } from '../../../data/dtos/report-template';

/** Datatypes that carry an options list (06 §5.1). */
export const OPTION_DATATYPES: QuestionDatatype[] = [
  QuestionDatatype.Select,
  QuestionDatatype.Multiselect,
  QuestionDatatype.Radio,
  QuestionDatatype.CheckboxGroup,
];
