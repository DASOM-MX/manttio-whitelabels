import { ReportStatus } from '../enums/reports.enum';

// Status transition predicates. The ReportStatus enum lives in
// enums/reports.enum.ts; these predicates are the single place lifecycle decisions
// are made (don't hardcode status strings in controllers/services).

/** The two birth states — a report that exists but has no content yet.
 *  `Created` is the manual path, `Pending` the order-explosion path (19 §2).
 *  Both promote to `InProgress` on the first content write. */
export const isBirthStatus = (s: ReportStatus) =>
  s === ReportStatus.Created || s === ReportStatus.Pending;

/** `Cancelled` is deliberately excluded: an order cancellation voids its
 *  unfinished reports, and a voided report must not accept content afterwards
 *  (19 §2) — editing one is a 409, same as editing a finished one. */
export const isEditableStatus = (s: ReportStatus) =>
  isBirthStatus(s) || s === ReportStatus.InProgress;

export const isFinishedOrMailed = (s: ReportStatus) =>
  s === ReportStatus.Finished || s === ReportStatus.Mailed;

/** What an order cancellation voids (19 §2): the unfinished work only.
 *  Finished and mailed reports are history and stay exactly as they are. */
export const isVoidableByOrderCancel = (s: ReportStatus) =>
  s === ReportStatus.Pending || s === ReportStatus.InProgress;
