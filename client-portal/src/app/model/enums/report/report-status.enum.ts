/** Report lifecycle — mirrors the backend `ReportStatus`
 *  (`backend/src/modules/reports/enums/reports.enum.ts`). The portal only
 *  ever receives `Finished`/`Mailed` (04 §2, A7 — every other status is
 *  filtered server-side); the rest are kept for wire-type fidelity. */
export enum ReportStatus {
  Pending = 'pending',
  Created = 'created',
  InProgress = 'in-progress',
  Finished = 'finished',
  Mailed = 'mailed',
  Cancelled = 'cancelled',
}
