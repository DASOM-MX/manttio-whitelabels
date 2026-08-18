// Report domain enums (literal unions + their value arrays). Kept separate from the
// zod validators so the DB check constraints and the type layer share one source.

// Work-type enum. Keep these literals in sync with the `reports_work_type_check`
// constraint in `models/reports.model.ts`.
export const workTypes = ['Preventivo', 'Correctivo', 'Instalación'] as const;
export type WorkType = (typeof workTypes)[number];

// Report lifecycle status. Keep the string values in sync with the
// `reports_status_check` constraint and the `status` column `$type` in
// `models/reports.model.ts`.
//
// Two birth states, one per creation path (19 §1 amendment): a manually-created
// report starts `Created`, while a report exploded from a service order starts
// `Pending` — born complete (client, folio, technician, type) but not yet
// opened. `Pending` promotes straight to `InProgress` when the technician opens
// it and picks a template, skipping `Created` entirely.
export enum ReportStatus {
  /** Exploded from a service order (19 §2) and not yet started. */
  Pending = 'pending',
  Created = 'created',
  InProgress = 'in-progress',
  Finished = 'finished',
  Mailed = 'mailed',
  /** Voided because its order was cancelled (19 §2). A lifecycle transition,
   *  never a delete — the row stays, and already-`Finished`/`Mailed` reports
   *  are left alone because they are history. */
  Cancelled = 'cancelled',
}
