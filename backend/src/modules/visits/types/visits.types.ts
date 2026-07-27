import type { scheduledVisits, visitEquipment } from '../models/visits.model';
import type { VisitCloseReason, VisitStatus } from '../enums/visits.enum';

export type VisitRow = typeof scheduledVisits.$inferSelect;
export type NewVisit = typeof scheduledVisits.$inferInsert;
export type NewVisitEquipment = typeof visitEquipment.$inferInsert;

/** The only fields the correction PATCH may touch (12 §4). `technicianId` is
 *  absent on purpose — reassignment is its own audited endpoint — and so is
 *  every terminal field, which no update path may reach. */
export type CorrectVisitFields = Partial<
  Pick<VisitRow, 'scheduledStart' | 'scheduledEnd' | 'title' | 'notes'>
>;

/** Fields the lifecycle endpoints write. Kept apart from `CorrectVisitFields`
 *  so a correction can never widen into a status change by accident. */
export type VisitLifecycleFields = Partial<
  Pick<VisitRow, 'status' | 'technicianId' | 'closeReason' | 'closeNote' | 'reportId'>
>;

/** Row + the joined display labels the calendar chip needs, so the week view
 *  renders without a second round trip per visit. */
export interface VisitWithMeta {
  row: VisitRow;
  customerName: string | null;
  technicianName: string | null;
  serviceOrderFolio: string | null;
}

/** One linked unit, flattened for the DTO. Name is whatever identifies the unit
 *  on screen — `equipment.name` falls back to brand/model at the read site. */
export interface VisitEquipmentLink {
  id: string;
  name: string | null;
}

/** What the visits API returns (12 §1). Timestamps are ISO strings; nullable
 *  columns collapse to `undefined` so the JSON stays free of explicit nulls,
 *  matching the equipment/services DTOs. */
export interface VisitDTO {
  id: string;
  customerId: string;
  customerName?: string;
  /** Absent on an unbound visit. Becomes always-present once the column is
   *  flipped to NOT NULL (19 §1). */
  serviceOrderId?: string;
  /** The parent order's display folio, so a chip can name its job without a
   *  second fetch. */
  serviceOrderFolio?: string;
  technicianId?: string;
  technicianName?: string;
  equipment: VisitEquipmentLink[];
  scheduledStart: string;
  scheduledEnd?: string;
  status: VisitStatus;
  closeReason?: VisitCloseReason;
  closeNote?: string;
  /** The closed visit this one replaces. */
  rescheduledFromId?: string;
  /** The successor this closed visit was rescheduled into. Derived, not stored
   *  — resolved only on the single-visit read, so the week list stays one query. */
  rescheduledToId?: string;
  reportId?: string;
  title?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
