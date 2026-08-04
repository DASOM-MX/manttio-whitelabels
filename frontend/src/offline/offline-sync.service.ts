import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { Store, select } from '@ngxs/store';
import { OfflineReportsState } from '../state/offline-reports/offline-reports.state';
import { PendingVisitActionsState } from '../state/pending-visit-actions/pending-visit-actions.state';
import { SyncPendingVisitActions } from '../state/pending-visit-actions/pending-visit-actions.actions';
import { SetOnline } from '../state/app/app.actions';
import { SyncDialogBridge } from './sync-dialog-bridge.service';

/** App-wide connectivity watcher. Reflects online/offline into `AppState` (read it
 *  via `select(AppState.isOnline)`), and when the connection is restored with work
 *  still queued, resumes it — each queue its own way:
 *
 *  - **Reports** are documents the user may not want to upload as-is, so the
 *    `SyncDialogBridge` opens the globally-mounted picker dialog and the user
 *    chooses.
 *  - **Visit actions** are facts — a tap happened at a time — so they sync
 *    silently, no dialog (12 CP-3). There is nothing to choose.
 *
 *  This service owns no UI. */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly store = inject(Store);
  private readonly bridge = inject(SyncDialogBridge);

  private readonly pendingCount = select(OfflineReportsState.count);
  private readonly pendingActionCount = select(PendingVisitActionsState.count);

  constructor() {
    // Seed the real value at boot (the app may launch already offline).
    this.store.dispatch(new SetOnline(typeof navigator === 'undefined' ? true : navigator.onLine));

    fromEvent(window, 'online')
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.store.dispatch(new SetOnline(true));
        this.promptSyncIfPending();
        this.syncVisitActionsIfPending();
      });

    fromEvent(window, 'offline')
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.store.dispatch(new SetOnline(false)));
  }

  /** Reconnect prompt. Offered on the `online` event when the queue is non-empty. */
  private promptSyncIfPending(): void {
    if (this.pendingCount() === 0) return;
    this.bridge.request$.next();
  }

  /** Queued taps resume without asking — the choice was made in the field. */
  private syncVisitActionsIfPending(): void {
    if (this.pendingActionCount() === 0) return;
    this.store.dispatch(new SyncPendingVisitActions());
  }
}
