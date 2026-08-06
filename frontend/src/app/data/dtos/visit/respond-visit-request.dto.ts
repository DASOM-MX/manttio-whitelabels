/** Terminar. `actualEnd` is the tap time (ISO); `reportId` links the produced
 *  report's folio when there is one. */
export interface RespondVisitRequest {
  actualEnd?: string;
  reportId?: string;
}
