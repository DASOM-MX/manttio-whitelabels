import type { VisitStatus } from '../../types/visit';

/** Filters for `GET /visits`. The backend requires **either** a bounded
 *  `from`+`to` window **or** an `internalCode` prefix — an unbounded visits
 *  scan has no legitimate caller. */
export interface VisitListQuery {
  from?: string;
  to?: string;
  internalCode?: string;
  technicianId?: string;
  customerId?: string;
  status?: VisitStatus;
}
