import type { scheduledVisits, visitEvents } from '../models/visits.model';
import type { VisitStatus } from '../enums/visits.enum';

export type VisitRow = typeof scheduledVisits.$inferSelect;
export type NewVisit = typeof scheduledVisits.$inferInsert;
export type VisitEventRow = typeof visitEvents.$inferSelect;

/** One audited field change — values serialized to strings (ISO for dates,
 *  the raw value for text; null clears). */
export interface VisitFieldChange {
  from: string | null;
  to: string | null;
}

/** The jsonb `changes` payload: field name → its before/after. */
export type VisitChanges = Record<string, VisitFieldChange>;

// technicianId is deliberately absent — reassignment only via the audited
// /assign path; status only via /status.
export type UpdateVisitFields = Partial<
  Pick<VisitRow, 'customerId' | 'scheduledStart' | 'scheduledEnd' | 'title' | 'notes'>
>;

export interface VisitListFilters {
  from: Date;
  to: Date;
  technicianId?: string;
  customerId?: string;
  status?: VisitStatus;
}

/** List/detail shape — the week grid renders chips without extra lookups. */
export interface VisitWithNames extends VisitRow {
  customerName: string | null;
  technicianName: string | null;
}

/** One audit-log entry with display names resolved. */
export interface VisitEventEntry extends VisitEventRow {
  actorName: string | null;
  fromTechnicianName: string | null;
  toTechnicianName: string | null;
}

export interface VisitWithHistory extends VisitWithNames {
  /** Full append-only audit trail, oldest-first. */
  events: VisitEventEntry[];
}

/** Result of the reschedule transaction: the closed original + its replacement. */
export interface RescheduleResult {
  closed: VisitRow;
  visit: VisitRow;
}
