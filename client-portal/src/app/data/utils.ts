import { HttpParams } from '@angular/common/http';
import type { HttpErrorBody } from './types/http/http-error-body.type';
import type { Query } from './types/http/query.type';

/** Extract a human-readable message from a thrown value. Tries the Angular
 *  `HttpErrorResponse` shape (`err.error.message`) first, then `Error.message`,
 *  then falls back to the supplied default. */
export const errorMessage = (err: unknown, fallback: string): string => {
  if (err && typeof err === 'object' && 'error' in err) {
    const inner = (err as HttpErrorBody).error;
    if (inner?.message) return inner.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
};

export const toParams = (q?: Query): HttpParams | undefined => {
  if (!q) return undefined;
  let p = new HttpParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    p = p.set(k, String(v));
  }
  return p;
};

/** `YYYY-MM-DD` from local calendar fields — deliberately not
 *  `toISOString().slice(0, 10)`, which converts to UTC first and can land a
 *  date picked at local midnight on the previous day. */
export const toCalendarDate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`;

/** Triggers a browser download for an in-memory blob (PDF/document fetches
 *  that arrive as a response body rather than a URL). */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
