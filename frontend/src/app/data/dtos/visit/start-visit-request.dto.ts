/** Iniciar. `actualStart` is the **tap** time (ISO) — queued offline it still
 *  records when the work began, not when the phone regained signal. */
export interface StartVisitRequest {
  actualStart: string;
}
