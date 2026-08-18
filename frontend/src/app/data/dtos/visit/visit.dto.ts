import type { VisitCloseReason, VisitStatus } from '../../types/visit';

/** One unit of the client's equipment linked to the visit. The nameplate
 *  fields arrive on the single-visit read only (the list keeps names) — the
 *  technician's visual reference for which unit the job is about. */
export interface VisitEquipmentLink {
  id: string;
  name?: string;
  brand?: string;
  model?: string;
  serialNumber?: string;
  kind?: string;
  capacity?: string;
  location?: string;
  /** Up to 3 CDN photo URLs (nameplate / install shot). */
  photos?: string[];
}

/** Mirror of the backend's `VisitDTO` (modules/visits, 12 §1). Timestamps are
 *  ISO strings; nullable columns arrive as absent keys, never explicit nulls.
 *  A visit is an immutable *plan* — the report (if any) is what happened. */
export interface Visit {
  id: string;
  /** `V-YYYYMMDD-NNNN` — backend-minted, the human-facing handle. */
  internalCode: string;
  customerId: string;
  customerName?: string;
  /** Where the job is — what the technician navigates to. */
  customerAddress?: string;
  serviceOrderId?: string;
  /** The parent order's display folio. */
  serviceOrderFolio?: string;
  serviceOrderPriority?: string;
  technicianId?: string;
  technicianName?: string;
  equipment: VisitEquipmentLink[];
  // --- planned ---
  scheduledStart: string;
  scheduledEnd?: string;
  expectedDurationMinutes: number;
  // --- actual (stamped by Iniciar / Terminar; the tap time, not sync time) ---
  actualStart?: string;
  actualEnd?: string;
  actualDurationMinutes?: number;
  status: VisitStatus;
  closeReason?: VisitCloseReason;
  closeNote?: string;
  /** The closed visit this one replaces / the successor it became. */
  rescheduledFromId?: string;
  rescheduledToId?: string;
  reportId?: string;
  title?: string;
  notes?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}
