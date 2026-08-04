import type { scheduledVisits, visitEquipment } from '../models/visits.model';
import type { VisitCloseReason, VisitStatus } from '../enums/visits.enum';
import type { ServiceOrderPriority } from '../../service-orders/enums/service-orders.enum';

export type VisitRow = typeof scheduledVisits.$inferSelect;
export type NewVisit = typeof scheduledVisits.$inferInsert;
export type NewVisitEquipment = typeof visitEquipment.$inferInsert;

/** What a caller may hand to an insert: everything but `internalCode`, which the
 *  repository mints from the daily counter inside the same transaction. Omitting
 *  it from the type is what makes "nothing above the repository authors a visit
 *  code" a compile-time rule rather than a convention. */
export type NewVisitFields = Omit<NewVisit, 'internalCode'>;

/** The only fields the correction PATCH may touch (12 §4). `technicianId` is
 *  absent on purpose — reassignment is its own audited endpoint — and so is
 *  every terminal field, which no update path may reach.
 *
 *  `scheduledEnd` is in here but is **never** taken from the request: the
 *  service derives it from `scheduledStart + expectedDurationMinutes` and writes
 *  the pair together, so the two can never drift apart. */
export type CorrectVisitFields = Partial<
  Pick<
    VisitRow,
    'scheduledStart' | 'scheduledEnd' | 'expectedDurationMinutes' | 'title' | 'notes'
  >
>;

/** What a correction request may actually *author*: `CorrectVisitFields` minus
 *  the derived `scheduledEnd`. This is the shape that reaches the audit trail,
 *  so the derived column cannot land there and report the same move twice. */
export type AuthoredCorrectionFields = Omit<CorrectVisitFields, 'scheduledEnd'>;

/** The two stamps `PATCH /:id/actuals` may rewrite. Neither is nullable: that
 *  endpoint fixes a mis-tapped time, it never erases one. `actualDuration
 *  Minutes` is absent because it is recomputed from the pair, never authored. */
export type CorrectActualsFields = Partial<Pick<VisitRow, 'actualStart' | 'actualEnd'>>;

/** Fields the lifecycle endpoints write. Kept apart from `CorrectVisitFields`
 *  so a correction can never widen into a status change by accident. */
export type VisitLifecycleFields = Partial<
  Pick<
    VisitRow,
    | 'status'
    | 'technicianId'
    | 'closeReason'
    | 'closeNote'
    | 'reportId'
    | 'actualStart'
    | 'actualEnd'
    | 'actualDurationMinutes'
  >
>;

/** Row + the joined display labels the calendar chip needs, so the week view
 *  renders without a second round trip per visit. */
export interface VisitWithMeta {
  row: VisitRow;
  customerName: string | null;
  technicianName: string | null;
  serviceOrderFolio: string | null;
  serviceOrderPriority: ServiceOrderPriority | null;
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
  /** `V-YYYYMMDD-NNNN`. Backend-minted and immutable — the human-facing handle
   *  for a visit, and what the list's `internalCode` prefix filter matches. */
  internalCode: string;
  customerId: string;
  customerName?: string;
  /** Absent on an unbound visit. Becomes always-present once the column is
   *  flipped to NOT NULL (19 §1). */
  serviceOrderId?: string;
  /** The parent order's display folio, so a chip can name its job without a
   *  second fetch. */
  serviceOrderFolio?: string;
  /** The parent order's dispatch priority — a visit inherits urgency from the
   *  order it serves (the calendar draws it on the block). */
  serviceOrderPriority?: ServiceOrderPriority;
  technicianId?: string;
  technicianName?: string;
  equipment: VisitEquipmentLink[];
  // --- PLANNED ---
  scheduledStart: string;
  /** Derived from `scheduledStart + expectedDurationMinutes`, never supplied by
   *  a caller. Optional only because visits created before CP-1b have none. */
  scheduledEnd?: string;
  expectedDurationMinutes: number;
  // --- ACTUAL (12 §1, owner 2026-07-31) ---
  /** Stamped by Iniciar; absent until a technician starts. */
  actualStart?: string;
  /** Stamped by Terminar; absent when staff completed the visit from the admin. */
  actualEnd?: string;
  /** Recomputed from the pair whenever both exist, so plan-vs-actual is readable
   *  without the client doing date arithmetic. */
  actualDurationMinutes?: number;
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
