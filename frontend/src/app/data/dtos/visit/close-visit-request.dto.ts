import type { VisitCloseReason } from '../../types/visit';

/** Cerrar — not served, for a categorized reason. The backend requires the
 *  note when the reason is `other`. */
export interface CloseVisitRequest {
  reason: VisitCloseReason;
  note?: string;
}
