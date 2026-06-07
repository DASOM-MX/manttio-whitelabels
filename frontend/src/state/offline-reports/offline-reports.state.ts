import { Injectable, inject } from '@angular/core';
import { State, Action, Selector, StateContext, Store } from '@ngxs/store';
import { EMPTY, Observable, from, of } from 'rxjs';
import { catchError, concatMap, finalize, mergeMap, switchMap, tap, toArray } from 'rxjs/operators';
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
  load(ctx: StateContext<OfflineReportsStateModel>): Observable<unknown> {
    return from(this.offline.list()).pipe(
      // Recover from an interrupted sync: anything stuck `uploading` is reset to `pending`.
      switchMap((records) => {
        const stuck = records.filter((r) => r.status === 'uploading');
        if (!stuck.length) return of(records);
        return from(stuck).pipe(
          mergeMap((r) => from(this.offline.setStatus(r.tempId, 'pending'))),
          toArray(),
          switchMap(() => of(records)),
        );
      }),
      tap((records) =>
        ctx.patchState({
          pending: records.map((r) =>
            toPendingSummary(r.status === 'uploading' ? { ...r, status: 'pending' } : r),
          ),
        }),
      ),
    );
  }

  @Action(QueueOfflineReport)
  queue(
    ctx: StateContext<OfflineReportsStateModel>,
    { fields, createdBy }: QueueOfflineReport,
  ): Observable<unknown> {
    return from(this.offline.enqueue(fields, createdBy)).pipe(
      tap((record) =>
        ctx.patchState({ pending: [...ctx.getState().pending, toPendingSummary(record)] }),
      ),
    );
  }

  @Action(SyncOfflineReports)
  syncAll(
    ctx: StateContext<OfflineReportsStateModel>,
    { tempIds }: SyncOfflineReports,
  ): Observable<unknown> {
    if (ctx.getState().uploading) return EMPTY;
    ctx.patchState({ uploading: true });
    // Snapshot ids up front; upload sequentially via concatMap so we never hammer the API.
    const queued = ctx.getState().pending.map((p) => p.tempId);
    const ids = tempIds?.length ? queued.filter((id) => tempIds.includes(id)) : queued;
    return from(ids).pipe(
      concatMap((tempId) => this.uploadOne(ctx, tempId)),
      finalize(() => ctx.patchState({ uploading: false })),
    );
  }

  @Action(SyncOfflineReport)
  syncOne(
    ctx: StateContext<OfflineReportsStateModel>,
    { tempId }: SyncOfflineReport,
  ): Observable<unknown> {
    if (ctx.getState().uploading) return EMPTY;
    ctx.patchState({ uploading: true });
    return this.uploadOne(ctx, tempId).pipe(
      finalize(() => ctx.patchState({ uploading: false })),
    );
  }

  @Action(DiscardPendingReport)
  discard(
    ctx: StateContext<OfflineReportsStateModel>,
    { tempId }: DiscardPendingReport,
  ): Observable<unknown> {
    return from(this.offline.remove(tempId)).pipe(
      tap(() =>
        ctx.patchState({ pending: ctx.getState().pending.filter((p) => p.tempId !== tempId) }),
      ),
    );
  }

  /** Upload one queued report by replaying it through the normal `CreateReport`
   *  flow — which also inserts the resulting server report into `ReportsState`.
   *  Success drops it from the queue; failure leaves it `failed` with the error
   *  recorded for a later manual retry. */
  private uploadOne(
    ctx: StateContext<OfflineReportsStateModel>,
    tempId: string,
  ): Observable<unknown> {
    return from(this.offline.get(tempId)).pipe(
      switchMap((record) => {
        if (!record) {
          console.warn('[OfflineReportsState] record missing from IndexedDB during sync', tempId);
          this.removeFromMirror(ctx, tempId);
          return EMPTY;
        }
        return from(this.offline.setStatus(tempId, 'uploading')).pipe(
          tap(() => this.patchStatus(ctx, tempId, 'uploading')),
          // Attribute the upload to the original creator, not whoever is logged in now.
          switchMap(() =>
            this.store.dispatch(
              new CreateReport({ ...record.fields, created_by: record.createdBy.id }),
            ),
          ),
          switchMap(() => from(this.offline.remove(tempId))),
          tap(() => this.removeFromMirror(ctx, tempId)),
          catchError((err) => {
            const message = errorMessage(err, 'Error al subir el reporte');
            console.error('[OfflineReportsState] sync failed', tempId, err);
            return from(this.offline.setStatus(tempId, 'failed', message)).pipe(
              tap(() => this.patchStatus(ctx, tempId, 'failed', message)),
            );
          }),
        );
      }),
    );
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
