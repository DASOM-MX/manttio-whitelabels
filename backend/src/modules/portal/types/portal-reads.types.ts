import type { PgColumn, PgSelect } from 'drizzle-orm/pg-core';
import type { EquipmentRow } from '../../equipment/types/equipment.types';
import type { ReportRow } from '../../reports/types/reports.types';
import type { ServiceOrderRow } from '../../service-orders/types/service-orders.types';

// The shared read machinery's shapes, plus what each section's repository hands
// its service (04 CP-1). Repositories import these; they never declare a type.

/** The page window every portal list takes (`portal-reads.validator`). */
export interface PortalPageQuery {
  page: number;
  limit: number;
}

/** The two columns every portal table is scoped on. `customer` differs by table
 *  — `reports.client_id`, everyone else's `customer_id`. */
export interface PortalScopeColumns {
  customer: PgColumn;
  deletedAt: PgColumn;
}

/** The status allowlist, for the sections that have one. Column and list travel
 *  together so neither can be passed without the other. */
export interface PortalReleasedStatuses {
  column: PgColumn;
  statuses: string[];
}

/** Turns one selected row into what the service consumes. */
export type PortalRowMapper<TSel extends PgSelect, TItem> = (row: Awaited<TSel>[number]) => TItem;

/** A report row plus the one staff name the portal *does* send (A13). */
export interface PortalReportRow {
  row: ReportRow;
  technicianName: string | null;
}

/** The technician columns the report select joins in. */
export interface PortalTechnicianColumns {
  name: string | null;
  paternalLastName: string | null;
  maternalLastName: string | null;
}

/** What the report select yields. The join is left, so the whole technician
 *  group is null when the row is gone. */
export interface PortalReportSelectRow {
  row: ReportRow;
  technician: PortalTechnicianColumns | null;
}

/** A unit plus its derived "último servicio" (04 §7's list column). */
export interface PortalEquipmentRow {
  row: EquipmentRow;
  lastServiceDate: Date | null;
}

/** What the equipment select yields: the aggregate is typed loosely, so the
 *  mapper normalizes it before anyone sees it. */
export interface PortalEquipmentSelectRow {
  row: EquipmentRow;
  lastServiceDate: Date | string | null;
}

/** An order row plus the quote it was born from (04 §6's folio column). Also
 *  the select's own shape — the correlated subqueries land already typed. */
export interface PortalServiceOrderRow {
  row: ServiceOrderRow;
  quotationId: string | null;
  quotationFolio: string | null;
}
