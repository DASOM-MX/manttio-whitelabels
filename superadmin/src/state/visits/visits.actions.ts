import type {
  CloseVisitRequest,
  CorrectVisitRequest,
  CreateVisitRequest,
  RescheduleVisitRequest,
  RespondVisitRequest,
  VisitListQuery,
} from '../../app/data/dtos/visit';

export class LoadVisits {
  static readonly type = '[Visits] Load Range';
  constructor(public query: VisitListQuery) {}
}

export class CreateVisit {
  static readonly type = '[Visits] Create';
  constructor(public payload: CreateVisitRequest) {}
}

/** Open-visit correction (scheduling fields only, 12 §4). */
export class CorrectVisit {
  static readonly type = '[Visits] Correct';
  constructor(
    public id: string,
    public payload: CorrectVisitRequest,
  ) {}
}

/** Reassignment on an open visit; `null` sends it back to the backlog. */
export class AssignVisit {
  static readonly type = '[Visits] Assign';
  constructor(
    public id: string,
    public technicianId: string | null,
  ) {}
}

export class RespondVisit {
  static readonly type = '[Visits] Respond';
  constructor(
    public id: string,
    public payload: RespondVisitRequest = {},
  ) {}
}

export class CloseVisit {
  static readonly type = '[Visits] Close';
  constructor(
    public id: string,
    public payload: CloseVisitRequest,
  ) {}
}

/** Mints the successor record off a closed visit (never edits it). */
export class RescheduleVisit {
  static readonly type = '[Visits] Reschedule';
  constructor(
    public id: string,
    public payload: RescheduleVisitRequest,
  ) {}
}
