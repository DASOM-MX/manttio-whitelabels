import { Pipe, PipeTransform } from '@angular/core';
import type { PortalCapturedAnswer } from '../data/dtos/portal-report/portal-report-capture.dto';

/** Snapshot answer → display string. Pure: answer objects are immutable. */
@Pipe({ name: 'answerValue' })
export class AnswerValuePipe implements PipeTransform {
  transform(answer: PortalCapturedAnswer): string {
    const v = answer.value;
    if (v === null || v === undefined || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    if (Array.isArray(v)) return v.join(', ');
    return String(v);
  }
}

/** Section column count → grid classes for the read-only snapshot renderer. */
@Pipe({ name: 'columnsGrid' })
export class ColumnsGridPipe implements PipeTransform {
  transform(columns: 1 | 2 | 3): string {
    return columns === 3
      ? 'grid gap-3 sm:grid-cols-3'
      : columns === 2
        ? 'grid gap-3 sm:grid-cols-2'
        : 'flex flex-col';
  }
}
