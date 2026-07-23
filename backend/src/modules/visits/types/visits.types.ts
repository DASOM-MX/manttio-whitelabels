import type { scheduledVisits, visitAssignments } from '../models/visits.model';
import type { VisitStatus } from '../enums/visits.enum';

export type VisitRow = typeof scheduledVisits.$inferSelect;
export type NewVisit = typeof scheduledVisits.$inferInsert;
export type AssignmentRow = typeof visitAssignments.$inferSelect;

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

/** One assignment-history entry with display names resolved. */
export interface AssignmentEntry extends AssignmentRow {
  fromTechnicianName: string | null;
  toTechnicianName: string | null;
  assignedByName: string | null;
}

export interface VisitWithHistory extends VisitWithNames {
  assignmentHistory: AssignmentEntry[];
}

/** Result of the reschedule transaction: the closed original + its replacement. */
export interface RescheduleResult {
  closed: VisitRow;
  visit: VisitRow;
}
