import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext, Store } from '@ngxs/store';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../../app/data/utils';
import { OfflineReportsService } from '../../offline/offline-reports.service';
import {
  toPendingSummary,
  type PendingReportStatus,
  type PendingReportSummary,
} from '../../offline/pending-report.model';
import { CreateReport } from '../reports/reports.actions';
import {
  LoadPendingReports,
  QueueOfflineReport,
  SyncOfflineReports,
  SyncOfflineReport,
  DiscardPendingReport,
} from './offline-reports.actions';

export interface OfflineReportsStateModel {
  /** Lightweight mirror of the IndexedDB queue (no blobs). IDB is the source of truth. */
  pending: PendingReportSummary[];
  /** Guards against concurrent sync runs (e.g. a reconnect firing mid-upload). */
  uploading: boolean;
}

@State<OfflineReportsStateModel>({
  name: 'offlineReports',
  defaults: { pending: [], uploading: false },
})
@Injectable()
export class OfflineReportsState {
  private readonly offline = inject(OfflineReportsService);
  private readonly store = inject(Store);

  @Selector() static pending(s: OfflineReportsStateModel): PendingReportSummary[] {
    return s.pending;
  }
  @Selector() static count(s: OfflineReportsStateModel): number {
    return s.pending.length;
  }
  @Selector() static hasPending(s: OfflineReportsStateModel): boolean {
    return s.pending.length > 0;
  }
  @Selector() static uploading(s: OfflineReportsStateModel): boolean {
    return s.uploading;
  }

  @Action(LoadPendingReports)
  async load(ctx: StateContext<OfflineReportsStateModel>) {
    const records = await this.offline.list();
    // Recover from an interrupted sync: anything stuck `uploading` is reset to `pending`.
    await Promise.all(
      records
        .filter((r) => r.status === 'uploading')
        .map((r) => this.offline.setStatus(r.tempId, 'pending')),
    );
    ctx.patchState({
      pending: records.map((r) =>
        toPendingSummary(r.status === 'uploading' ? { ...r, status: 'pending' } : r),
      ),
    });
  }

  @Action(QueueOfflineReport)
  async queue(
    ctx: StateContext<OfflineReportsStateModel>,
    { fields, createdBy }: QueueOfflineReport,
  ) {
    const record = await this.offline.enqueue(fields, createdBy);
    ctx.patchState({ pending: [...ctx.getState().pending, toPendingSummary(record)] });
  }

  @Action(SyncOfflineReports)
  async syncAll(ctx: StateContext<OfflineReportsStateModel>) {
    if (ctx.getState().uploading) return;
    ctx.patchState({ uploading: true });
    try {
      // Snapshot ids up front; upload sequentially so we never hammer the API.
      const ids = ctx.getState().pending.map((p) => p.tempId);
      for (const tempId of ids) await this.uploadOne(ctx, tempId);
    } finally {
      ctx.patchState({ uploading: false });
    }
  }

  @Action(SyncOfflineReport)
  async syncOne(ctx: StateContext<OfflineReportsStateModel>, { tempId }: SyncOfflineReport) {
    if (ctx.getState().uploading) return;
    ctx.patchState({ uploading: true });
    try {
      await this.uploadOne(ctx, tempId);
    } finally {
      ctx.patchState({ uploading: false });
    }
  }

  @Action(DiscardPendingReport)
  async discard(ctx: StateContext<OfflineReportsStateModel>, { tempId }: DiscardPendingReport) {
    await this.offline.remove(tempId);
    ctx.patchState({ pending: ctx.getState().pending.filter((p) => p.tempId !== tempId) });
  }

  /** Upload one queued report by replaying it through the normal `CreateReport`
   *  flow — which also inserts the resulting server report into `ReportsState`.
   *  Success drops it from the queue; failure leaves it `failed` with the error
   *  recorded for a later manual retry. */
  private async uploadOne(
    ctx: StateContext<OfflineReportsStateModel>,
    tempId: string,
  ): Promise<void> {
    const record = await this.offline.get(tempId);
    if (!record) {
      console.warn('[OfflineReportsState] record missing from IndexedDB during sync', tempId);
      this.removeFromMirror(ctx, tempId);
      return;
    }
    await this.offline.setStatus(tempId, 'uploading');
    this.patchStatus(ctx, tempId, 'uploading');
    try {
      await firstValueFrom(this.store.dispatch(new CreateReport(record.fields)));
      await this.offline.remove(tempId);
      this.removeFromMirror(ctx, tempId);
    } catch (err) {
      const message = errorMessage(err, 'Error al subir el reporte');
      console.error('[OfflineReportsState] sync failed', tempId, err);
      await this.offline.setStatus(tempId, 'failed', message);
      this.patchStatus(ctx, tempId, 'failed', message);
    }
  }

  private patchStatus(
    ctx: StateContext<OfflineReportsStateModel>,
    tempId: string,
    status: PendingReportStatus,
    lastError?: string,
  ): void {
    ctx.patchState({
      pending: ctx
        .getState()
        .pending.map((p) => (p.tempId === tempId ? { ...p, status, lastError } : p)),
    });
  }

  private removeFromMirror(ctx: StateContext<OfflineReportsStateModel>, tempId: string): void {
    ctx.patchState({ pending: ctx.getState().pending.filter((p) => p.tempId !== tempId) });
  }
}
