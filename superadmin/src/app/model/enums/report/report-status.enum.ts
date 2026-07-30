/** Report lifecycle — full parity with the backend `ReportStatus`
 *  (`backend/src/modules/reports/enums/reports.enum.ts`). Two birth states,
 *  one per creation path: `Created` is a manually-opened report, `Pending` one
 *  exploded from a service order (19 §2) that promotes straight to
 *  `InProgress` when its technician opens it. */
export enum ReportStatus {
  /** Exploded from a service order (19 §2), not yet opened by its technician. */
  Pending = 'pending',
  Created = 'created',
  InProgress = 'in-progress',
  Finished = 'finished',
  Mailed = 'mailed',
  /** Voided because its service order was cancelled (19 §2). */
  Cancelled = 'cancelled',
}
