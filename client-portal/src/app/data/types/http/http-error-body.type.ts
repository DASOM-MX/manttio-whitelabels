/** The body an `HttpErrorResponse` carries when the backend answered with its
 *  own error envelope. Narrowed by `errorMessage`, which shows it verbatim. */
export interface HttpErrorBody {
  error?: { message?: string };
}
