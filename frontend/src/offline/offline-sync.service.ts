import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { Store, select } from '@ngxs/store';
import { OfflineReportsState } from '../state/offline-reports/offline-reports.state';
import { SetOnline } from '../state/app/app.actions';
import { SyncDialogBridge } from './sync-dialog-bridge.service';

/** App-wide connectivity watcher. Reflects online/offline into `AppState` (read it
 *  via `select(AppState.isOnline)`), and when the connection is restored with reports
 *  still queued, pokes the `SyncDialogBridge` so the globally-mounted
 *  `<app-sync-pending-reports-dialog />` opens. This service owns no UI. */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly store = inject(Store);
  private readonly bridge = inject(SyncDialogBridge);

  private readonly pendingCount = select(OfflineReportsState.count);

  constructor() {
    // Seed the real value at boot (the app may launch already offline).
    this.store.dispatch(new SetOnline(typeof navigator === 'undefined' ? true : navigator.onLine));

    fromEvent(window, 'online')
      .pipe(takeUntilDestroyed())
      .subscribe(() => {
        this.store.dispatch(new SetOnline(true));
        this.promptSyncIfPending();
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
}
