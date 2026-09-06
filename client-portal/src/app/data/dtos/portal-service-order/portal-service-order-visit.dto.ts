import type { VisitStatus } from '../../../model/enums/visit/visit-status.enum';

/** One visit on the order (backend `PortalServiceOrderVisit`, 04 §6 amended
 *  2026-09-05): the window it is booked for and how it went. `scheduledEnd` is
 *  nullable — an open-ended visit is a start time and nothing more. The
 *  technician behind it is never on the wire. */
export interface PortalServiceOrderVisit {
  scheduledStart: string;
  scheduledEnd: string | null;
  status: VisitStatus;
}
