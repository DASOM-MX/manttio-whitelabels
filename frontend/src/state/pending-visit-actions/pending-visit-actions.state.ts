import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { State, Action, Selector, StateContext, Store } from '@ngxs/store';
import { EMPTY, Observable, from, of } from 'rxjs';
import { catchError, concatMap, finalize, mergeMap, switchMap, tap, toArray } from 'rxjs/operators';
import { errorMessage } from '../../app/data/utils';
import { AppState } from '../app/app.state';
import { VisitsService } from '../../http/visits.service';
import { OfflineVisitActionsService } from '../../offline/offline-visit-actions.service';
import {
  PendingVisitActionStatus,
  PendingVisitActionType,
} from '../../offline/pending-visit-action.model';
import type { PendingVisitAction } from '../../offline/pending-visit-action.model';
import type { Visit } from '../../app/data/dtos/visit';
import { VisitSynced } from '../visits/visits.actions';
import {
  LoadPendingVisitActions,
  QueueVisitAction,
  SyncPendingVisitActions,
} from './pending-visit-actions.actions';

export interface PendingVisitActionsStateModel {
  /** Mirror of the queue's **live** records (pending/syncing) — terminal ones
   *  stay only in IndexedDB as the device's local trace. IDB is the truth. */
  pending: PendingVisitAction[];
  /** Guards against concurrent sync runs (a reconnect firing mid-run). */
  syncing: boolean;
}

/** The server spoke: it evaluated the tap and refused it under its own rules
 *  (duplicate Iniciar, a visit office already resolved, a stamp its validators
 *  reject). Retrying can never change that answer — the record is superseded
 *  and the server's state is re-read as the truth. Anything else (no network,
 *  5xx, an expired token) is transient: the tap stays queued and its visit's
 *  chain halts until the next reconnect, preserving tap order. */
const DEFINITIVE_REJECTIONS = [400, 403, 404, 409, 422];
const isDefinitiveRejection = (err: unknown): boolean =>
  err instanceof HttpErrorResponse && DEFINITIVE_REJECTIONS.includes(err.status);

@State<PendingVisitActionsStateModel>({
  name: 'pendingVisitActions',
  defaults: { pending: [], syncing: false },
})
@Injectable()
export class PendingVisitActionsState {
  private readonly offline = inject(OfflineVisitActionsService);
  private readonly visits = inject(VisitsService);
  private readonly store = inject(Store);

  @Selector() static pending(s: PendingVisitActionsStateModel): PendingVisitAction[] {
    return s.pending;
  }
  @Selector() static count(s: PendingVisitActionsStateModel): number {
    return s.pending.length;
  }
  @Selector() static hasPending(s: PendingVisitActionsStateModel): boolean {
    return s.pending.length > 0;
  }
  @Selector() static syncing(s: PendingVisitActionsStateModel): boolean {
    return s.syncing;
  }

  @Action(LoadPendingVisitActions)
  load(ctx: StateContext<PendingVisitActionsStateModel>): Observable<unknown> {
    return from(this.offline.pruneTerminal()).pipe(
      switchMap(() => from(this.offline.list())),
      // Recover from an interrupted run: anything stuck `syncing` goes back to
      // `pending` — the tap was made, whether it was delivered is unknown, and
      // redelivering is safe because the server refuses duplicates.
      switchMap((records) => {
        const stuck = records.filter((r) => r.status === PendingVisitActionStatus.Syncing);
        if (!stuck.length) return of(records);
        return from(stuck).pipe(
          mergeMap((r) =>
            from(this.offline.setStatus(r.tempId, PendingVisitActionStatus.Pending)),
          ),
          toArray(),
          switchMap(() => from(this.offline.list())),
        );
      }),
      tap((records) =>
        ctx.patchState({
          pending: records.filter((r) => r.status === PendingVisitActionStatus.Pending),
        }),
      ),
      // The reconnect may have happened while the app was closed — deliver now.
      switchMap(() =>
        ctx.getState().pending.length && this.store.selectSnapshot(AppState.isOnline)
          ? ctx.dispatch(new SyncPendingVisitActions())
          : of(null),
      ),
    );
  }

  @Action(QueueVisitAction)
  queue(
    ctx: StateContext<PendingVisitActionsStateModel>,
    { visit, action, close }: QueueVisitAction,
  ): Observable<unknown> {
    return from(
      this.offline.enqueue({
        visitId: visit.id,
        internalCode: visit.internalCode,
        action,
        close,
      }),
    ).pipe(
      tap((record) =>
        ctx.patchState({ pending: [...ctx.getState().pending, record] }),
      ),
      switchMap(() =>
        this.store.selectSnapshot(AppState.isOnline)
          ? ctx.dispatch(new SyncPendingVisitActions())
          : of(null),
      ),
    );
  }

  @Action(SyncPendingVisitActions)
  sync(ctx: StateContext<PendingVisitActionsStateModel>): Observable<unknown> {
    if (ctx.getState().syncing) return EMPTY;
    ctx.patchState({ syncing: true });
    // Snapshot in tap order. `halted` collects visits whose chain hit a
    // transient failure — their later taps must wait for the next run, or a
    // Terminar could outrun the Iniciar it follows.
    const queue = [...ctx.getState().pending].sort((a, b) => a.at.localeCompare(b.at));
    const snapshotIds = new Set(queue.map((r) => r.tempId));
    const halted = new Set<string>();
    return from(queue).pipe(
      concatMap((record) =>
        halted.has(record.visitId) ? EMPTY : this.syncOne(ctx, record, halted),
      ),
      finalize(() => {
        ctx.patchState({ syncing: false });
        // A tap made *during* this run missed the snapshot — run once more for
        // it. Only fresh taps re-trigger (never this run's own transient
        // failures, which wait for the next reconnect), so this cannot loop.
        const fresh = ctx
          .getState()
          .pending.some((p) => !snapshotIds.has(p.tempId) && !halted.has(p.visitId));
        if (fresh && this.store.selectSnapshot(AppState.isOnline)) {
          ctx.dispatch(new SyncPendingVisitActions());
        }
      }),
    );
  }

  /** Deliver one tap. Success and definitive rejection both retire the record
   *  (the latter re-reading the server's truth so the UI shows what actually
   *  stands); a transient failure leaves it queued and halts its visit. */
  private syncOne(
    ctx: StateContext<PendingVisitActionsStateModel>,
    record: PendingVisitAction,
    halted: Set<string>,
  ): Observable<unknown> {
    return from(
      this.offline.setStatus(record.tempId, PendingVisitActionStatus.Syncing),
    ).pipe(
      tap(() => this.patchStatus(ctx, record.tempId, PendingVisitActionStatus.Syncing)),
      switchMap(() => this.deliver(record)),
      switchMap((visit) =>
        from(this.offline.setStatus(record.tempId, PendingVisitActionStatus.Synced)).pipe(
          tap(() => this.removeFromMirror(ctx, record.tempId)),
          switchMap(() => ctx.dispatch(new VisitSynced(visit))),
        ),
      ),
      catchError((err) => {
        const message = errorMessage(err, 'No se pudo sincronizar la acción');
        if (isDefinitiveRejection(err)) {
          return from(
            this.offline.setStatus(record.tempId, PendingVisitActionStatus.Superseded, message),
          ).pipe(
            tap(() => this.removeFromMirror(ctx, record.tempId)),
            // Server wins — fetch what it holds so the UI stops showing the
            // tap's effect. A failed re-read is not worth aborting the run.
            switchMap(() => this.visits.get(record.visitId)),
            switchMap((visit) => ctx.dispatch(new VisitSynced(visit))),
            catchError(() => of(null)),
          );
        }
        halted.add(record.visitId);
        return from(
          this.offline.setStatus(record.tempId, PendingVisitActionStatus.Pending, message),
        ).pipe(
          tap(() => this.patchStatus(ctx, record.tempId, PendingVisitActionStatus.Pending, message)),
        );
      }),
    );
  }

  /** The API call a queued tap becomes. `record.at` — the tap time — is what
   *  crosses the wire; the sync time appears nowhere. */
  private deliver(record: PendingVisitAction): Observable<Visit> {
    switch (record.action) {
      case PendingVisitActionType.Start:
        return this.visits.start(record.visitId, { actualStart: record.at });
      case PendingVisitActionType.Respond:
        return this.visits.respond(record.visitId, { actualEnd: record.at });
      case PendingVisitActionType.Close:
        return this.visits.close(record.visitId, record.close!);
    }
  }

  private patchStatus(
    ctx: StateContext<PendingVisitActionsStateModel>,
    tempId: string,
    status: PendingVisitActionStatus,
    lastError?: string,
  ): void {
    ctx.patchState({
      pending: ctx
        .getState()
        .pending.map((p) => (p.tempId === tempId ? { ...p, status, lastError } : p)),
    });
  }

  private removeFromMirror(
    ctx: StateContext<PendingVisitActionsStateModel>,
    tempId: string,
  ): void {
    ctx.patchState({
      pending: ctx.getState().pending.filter((p) => p.tempId !== tempId),
    });
  }
}
