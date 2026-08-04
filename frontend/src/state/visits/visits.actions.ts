import type { VisitListQuery } from '../../app/data/dtos/visit';
import type { Visit } from '../../app/data/dtos/visit';

/** Load the technician's window (my-visits). The query must carry a bounded
 *  `from`+`to` — the backend refuses an unbounded visits scan. */
export class LoadMyVisits {
  static readonly type = '[Visits] Load my visits';
  constructor(public readonly query: VisitListQuery) {}
}

/** Load one visit into `selected` (visit-detail). */
export class LoadVisit {
  static readonly type = '[Visits] Load visit';
  constructor(public readonly id: string) {}
}

/** A server truth arrived for one visit — from a successful queued-tap sync,
 *  or the re-read after the server overruled one. Patches the row wherever it
 *  is held; there is no reason to refuse fresher data. */
export class VisitSynced {
  static readonly type = '[Visits] Visit synced';
  constructor(public readonly visit: Visit) {}
}
