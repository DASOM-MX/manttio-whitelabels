import { Pipe, PipeTransform } from '@angular/core';
import type { ReportAnswer } from '../data/dtos/report';

/** Snapshot answer → display string (06 §5.5). Pure: answer objects are
 *  immutable snapshot rows. */
@Pipe({ name: 'answerValue' })
export class AnswerValuePipe implements PipeTransform {
  transform(answer: ReportAnswer): string {
    const v = answer.value;
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  }
}

/** Section column count → grid classes for the snapshot renderer. */
@Pipe({ name: 'columnsGrid' })
export class ColumnsGridPipe implements PipeTransform {
  transform(columns: 1 | 2 | 3, mode: 'view' | 'preview' = 'view'): string {
    if (mode === 'preview') {
      return columns === 3
        ? 'grid grid-cols-3 gap-3'
        : columns === 2
          ? 'grid grid-cols-2 gap-3'
          : '';
    }
    return columns === 3
      ? 'grid gap-3 sm:grid-cols-3'
      : columns === 2
        ? 'grid gap-3 sm:grid-cols-2'
        : 'flex flex-col';
  }
}
