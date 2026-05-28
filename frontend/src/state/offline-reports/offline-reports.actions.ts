import type { CreateReportFields } from '../../app/data/dtos/report';
import type { PendingReportCreator } from '../../offline/pending-report.model';

/** Hydrate the in-memory queue from IndexedDB. Dispatched on app boot.
 *  Also recovers any report left stuck `uploading` by an interrupted sync. */
export class LoadPendingReports {
  static readonly type = '[OfflineReports] Load';
}

/** Persist a finished report to IndexedDB while offline. `createdBy` is the
 *  logged-in user at capture time, kept so attribution survives a phone swap. */
export class QueueOfflineReport {
  static readonly type = '[OfflineReports] Queue';
  constructor(
    public fields: CreateReportFields,
    public createdBy: PendingReportCreator,
  ) {}
}

/** Replay every queued report (FIFO) through the normal create flow. */
export class SyncOfflineReports {
  static readonly type = '[OfflineReports] Sync All';
}

/** Replay a single queued report — used by the pending detail page's Upload button. */
export class SyncOfflineReport {
  static readonly type = '[OfflineReports] Sync One';
  constructor(public tempId: string) {}
}

/** Drop a queued report without uploading it. */
export class DiscardPendingReport {
  static readonly type = '[OfflineReports] Discard';
  constructor(public tempId: string) {}
}
