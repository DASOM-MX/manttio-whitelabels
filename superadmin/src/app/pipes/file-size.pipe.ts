import { Pipe, PipeTransform } from '@angular/core';

const UNITS = ['B', 'KB', 'MB', 'GB'] as const;

/** Byte count as a short human size. Informational only — the backend caps
 *  uploads, so this never has to reason about limits. */
@Pipe({ name: 'fileSize' })
export class FileSizePipe implements PipeTransform {
  transform(bytes: number | undefined | null): string {
    if (bytes == null || bytes < 0) return '—';
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < UNITS.length - 1) {
      size /= 1024;
      unit += 1;
    }
    // Whole bytes read oddly with decimals; everything above gets one.
    const rounded = unit === 0 ? String(size) : size.toFixed(1);
    return `${rounded} ${UNITS[unit]}`;
  }
}
