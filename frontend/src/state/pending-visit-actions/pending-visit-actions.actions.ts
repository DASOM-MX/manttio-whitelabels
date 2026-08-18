import type { CloseVisitRequest, Visit } from '../../app/data/dtos/visit';
import type { PendingVisitActionType } from '../../offline/pending-visit-action.model';

/** Hydrate the queue mirror from IndexedDB at boot. Recovers records stuck
 *  `syncing` by an interrupted run, prunes old terminal ones, and — when the
 *  device is online with taps still queued — kicks off a sync immediately (the
 *  reconnect may have happened while the app was closed). */
export class LoadPendingVisitActions {
  static readonly type = '[PendingVisitActions] Load';
}

/** Record a tap. **The only write path for Iniciar/Terminar/Cerrar** — online
 *  or not, the tap lands in the queue with its local timestamp and the sync
 *  pass delivers it (immediately when connected). One code path means the
 *  server always receives the tap time, never a replayed `now()`. */
export class QueueVisitAction {
  static readonly type = '[PendingVisitActions] Queue';
  constructor(
    public readonly visit: Visit,
    public readonly action: PendingVisitActionType,
    public readonly close?: CloseVisitRequest,
  ) {}
}

/** Deliver the queue: strict tap order per visit, server wins on a definitive
 *  rejection, a transient failure halts that visit's chain until the next
 *  reconnect (offline conflict rule, owner 2026-08-04). */
export class SyncPendingVisitActions {
  static readonly type = '[PendingVisitActions] Sync';
}
