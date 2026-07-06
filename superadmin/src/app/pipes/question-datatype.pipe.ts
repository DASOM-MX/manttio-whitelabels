import { Pipe, PipeTransform } from '@angular/core';
import { OPTION_DATATYPES } from '../model/constants/report-template/option-datatypes.const';
import type { QuestionDatatype } from '../data/dtos/report-template';

/** Whether a datatype carries an options list (06 §5.1). Keyed on the
 *  primitive value so it re-evaluates when the picker changes. */
@Pipe({ name: 'hasOptions' })
export class HasOptionsPipe implements PipeTransform {
  transform(datatype: QuestionDatatype): boolean {
    return OPTION_DATATYPES.includes(datatype);
  }
}
