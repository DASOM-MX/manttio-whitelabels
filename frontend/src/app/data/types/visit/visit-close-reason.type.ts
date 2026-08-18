// Why a visit was closed without being served (backend modules/visits, 12 §1).
// A required category on every close; `Other` additionally requires a note —
// the escape hatch has to carry its own explanation.
export enum VisitCloseReason {
  ClientCancelled = 'client_cancelled',
  ClientAbsent = 'client_absent',
  NoAccess = 'no_access',
  TechUnavailable = 'tech_unavailable',
  Other = 'other',
}
