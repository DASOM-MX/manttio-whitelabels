import type { WorkType } from '../../app/data/types/report';

export interface ReportDraftPatch {
  customerId?: string | null;
  workType?: WorkType | null;
  templateId?: string;
}

/** Ensure a draft exists. If none, stamps `arrivalAt = now()`. Idempotent: a second
 *  Open on top of an existing draft is a no-op so the arrival timestamp survives
 *  page refreshes. */
export class OpenReportDraft {
  static readonly type = '[ReportDraft] Open';
}

export class UpdateReportDraft {
  static readonly type = '[ReportDraft] Update';
  constructor(public patch: ReportDraftPatch) {}
}

export class DiscardReportDraft {
  static readonly type = '[ReportDraft] Discard';
}
