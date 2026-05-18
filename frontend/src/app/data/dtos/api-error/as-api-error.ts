import type { HttpErrorResponse } from '@angular/common/http';
import type { ApiError } from './api-error.dto';

export const asApiError = (e: HttpErrorResponse): ApiError =>
  (e.error && typeof e.error === 'object' ? e.error : { error: 'unknown' }) as ApiError;
