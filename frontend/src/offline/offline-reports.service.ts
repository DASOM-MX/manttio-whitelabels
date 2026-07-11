import { Injectable } from '@angular/core';
import type { CreateReportFields } from '../app/data/dtos/report';
import { OfflineReportsDb } from './offline-reports.db';
import { PendingReportStatus } from './pending-report.model';
import type { PendingReport, PendingReportCreator } from './pending-report.model';

/** Persistence layer for reports captured offline. Wraps the IndexedDB store;
 *  all methods are Promise-based. Higher layers (NGXS `OfflineReportsState`)
 *  mirror this for the UI and drive the upload/sync flow. */
@Injectable({ providedIn: 'root' })
export class OfflineReportsService {
  private readonly db = new OfflineReportsDb();

  /** Persist a finished offline report and return the stored record. */
  async enqueue(fields: CreateReportFields, createdBy: PendingReportCreator): Promise<PendingReport> {
    const record: PendingReport = {
      tempId: crypto.randomUUID(),
      fields,
      createdBy,
      createdAt: new Date().toISOString(),
      status: PendingReportStatus.Pending,
    };
    await this.db.pendingReports.add(record);
    return record;
  }

  /** All queued reports, oldest first (FIFO upload order). */
  list(): Promise<PendingReport[]> {
    return this.db.pendingReports.orderBy('createdAt').toArray();
  }

  /** A single queued report (with its blobs) — used by the pending detail page. */
  get(tempId: string): Promise<PendingReport | undefined> {
    return this.db.pendingReports.get(tempId);
  }

  /** Number of reports awaiting upload (for the pending badge). */
  count(): Promise<number> {
    return this.db.pendingReports.count();
  }

  /** Update upload status. Passing no `lastError` clears any previous error. */
  async setStatus(tempId: string, status: PendingReportStatus, lastError?: string): Promise<void> {
    await this.db.pendingReports.update(tempId, { status, lastError });
  }

  /** Drop a report from the queue (after a successful upload or a discard). */
  async remove(tempId: string): Promise<void> {
    await this.db.pendingReports.delete(tempId);
  }
}
