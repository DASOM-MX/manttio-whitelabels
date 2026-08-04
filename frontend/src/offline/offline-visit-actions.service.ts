import { inject, Injectable } from '@angular/core';
import { OfflineDb } from './offline.db';
import {
  PendingVisitActionStatus,
  PendingVisitActionType,
} from './pending-visit-action.model';
import type { PendingVisitAction } from './pending-visit-action.model';
import type { CloseVisitRequest } from '../app/data/dtos/visit';

/** How long a terminal (synced/superseded) tap record stays on the device
 *  before the boot-time prune drops it. Long enough to argue about a disputed
 *  sync; short enough that the queue never grows without bound. */
const TERMINAL_RETENTION_DAYS = 30;

/** Persistence layer for visit taps queued offline (12 CP-3). Wraps the
 *  IndexedDB store; all methods are Promise-based. The NGXS
 *  `PendingVisitActionsState` mirrors this for the UI and drives the sync. */
@Injectable({ providedIn: 'root' })
export class OfflineVisitActionsService {
  private readonly db = inject(OfflineDb);

  /** Queue a tap. `at` defaults to now — the tap is being made this instant;
   *  it is the *sync* that may happen much later. */
  async enqueue(input: {
    visitId: string;
    internalCode: string;
    action: PendingVisitActionType;
    close?: CloseVisitRequest;
  }): Promise<PendingVisitAction> {
    const record: PendingVisitAction = {
      tempId: crypto.randomUUID(),
      visitId: input.visitId,
      internalCode: input.internalCode,
      action: input.action,
      at: new Date().toISOString(),
      ...(input.close ? { close: input.close } : {}),
      status: PendingVisitActionStatus.Pending,
    };
    await this.db.pendingVisitActions.add(record);
    return record;
  }

  /** Every queued record, oldest tap first — the sync's FIFO order. */
  list(): Promise<PendingVisitAction[]> {
    return this.db.pendingVisitActions.orderBy('at').toArray();
  }

  get(tempId: string): Promise<PendingVisitAction | undefined> {
    return this.db.pendingVisitActions.get(tempId);
  }

  /** Move a record through the sync lifecycle. Terminal statuses stamp
   *  `syncedAt`; passing no `lastError` clears any previous one. */
  async setStatus(
    tempId: string,
    status: PendingVisitActionStatus,
    lastError?: string,
  ): Promise<void> {
    const terminal =
      status === PendingVisitActionStatus.Synced ||
      status === PendingVisitActionStatus.Superseded;
    await this.db.pendingVisitActions.update(tempId, {
      status,
      lastError,
      ...(terminal ? { syncedAt: new Date().toISOString() } : {}),
    });
  }

  /** Drop terminal records past retention. Runs at boot — the queue is the
   *  device's local trace of taps, not an archive. */
  async pruneTerminal(): Promise<void> {
    const cutoff = new Date(
      Date.now() - TERMINAL_RETENTION_DAYS * 24 * 60 * 60_000,
    ).toISOString();
    await this.db.pendingVisitActions
      .where('status')
      .anyOf(PendingVisitActionStatus.Synced, PendingVisitActionStatus.Superseded)
      .and((r) => (r.syncedAt ?? r.at) < cutoff)
      .delete();
  }
}
