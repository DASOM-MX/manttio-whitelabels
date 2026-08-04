/** Why a visit was closed (12 §1): a single `closed` status plus a required
 *  category — the reasons are reporting dimensions, not lifecycle states.
 *  `Other` demands a note (the escape hatch has to carry its own explanation).
 *  Values are byte-identical to the backend's `VisitCloseReason`. */
export enum VisitCloseReason {
  ClientCancelled = 'client_cancelled',
  ClientAbsent = 'client_absent',
  NoAccess = 'no_access',
  TechUnavailable = 'tech_unavailable',
  Other = 'other',
}
