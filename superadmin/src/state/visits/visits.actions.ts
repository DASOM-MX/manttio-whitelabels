import type {
  CloseVisitRequest,
  CorrectVisitActualsRequest,
  CorrectVisitRequest,
  CreateVisitRequest,
  RescheduleVisitRequest,
  RespondVisitRequest,
  VisitListQuery,
  VisitStreamFrame,
} from '../../app/data/dtos/visit';

/** One load path for both narrowings the API accepts — a week (`from`+`to`) or
 *  an `internalCode` prefix. They differ only in the query, so they are the same
 *  action rather than two that would have to keep one `items` list in step. */
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

/** Owner/admin fix of a recorded stamp on a terminal visit (12 §2). */
export class CorrectVisitActuals {
  static readonly type = '[Visits] Correct Actuals';
  constructor(
    public id: string,
    public payload: CorrectVisitActualsRequest,
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

/** Opens the live visit stream (12 CP-4) for as long as the calendar is on
 *  screen; every (re)connect re-reads the loaded window first. */
export class ListenVisits {
  static readonly type = '[Visits] Listen';
}

/** Tears the stream down when the calendar page leaves. */
export class StopListeningVisits {
  static readonly type = '[Visits] Stop Listening';
}

/** One live frame, re-dispatched as an action so every interested surface —
 *  the state's upsert, the open visit dialog — reacts through the Actions
 *  stream instead of each holding its own subscription. */
export class VisitEventReceived {
  static readonly type = '[Visits] Event Received';
  constructor(public frame: VisitStreamFrame) {}
}
