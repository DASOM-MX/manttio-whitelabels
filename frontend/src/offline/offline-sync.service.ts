import { Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { fromEvent } from 'rxjs';
import { Actions, Store, ofActionSuccessful, select } from '@ngxs/store';
import { ConfirmationService, MessageService } from 'primeng/api';
import { OfflineReportsState } from '../state/offline-reports/offline-reports.state';
import { SyncOfflineReports } from '../state/offline-reports/offline-reports.actions';
import { SetOnline } from '../state/app/app.actions';

/** App-wide connectivity watcher. Reflects online/offline into `AppState` (read it
 *  via `select(AppState.isOnline)`), and when the connection is restored with reports
 *  still queued, prompts the user to upload them. The upload itself is owned by
 *  `OfflineReportsState`; this service only orchestrates — it exposes no public API. */
@Injectable({ providedIn: 'root' })
export class OfflineSyncService {
  private readonly store = inject(Store);
  private readonly actions$ = inject(Actions);
  private readonly confirm = inject(ConfirmationService);
  private readonly messages = inject(MessageService);

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

    // Summarize the outcome once a full sync settles (partial failures stay queued).
    this.actions$.pipe(ofActionSuccessful(SyncOfflineReports), takeUntilDestroyed()).subscribe(() => {
      const remaining = this.pendingCount();
      if (remaining === 0) {
        this.messages.add({ severity: 'success', summary: 'Reportes sincronizados' });
      } else {
        this.messages.add({
          severity: 'warn',
          summary: `${remaining} reporte${remaining === 1 ? '' : 's'} sin subir`,
          detail: 'Puedes reintentar desde el detalle del reporte.',
        });
      }
    });
  }

  /** Reconnect prompt. Offered on the `online` event when the queue is non-empty. */
  private promptSyncIfPending(): void {
    const n = this.pendingCount();
    if (n === 0) return;
    this.confirm.confirm({
      header: 'Conexión restaurada',
      message: `Tienes ${n} reporte${n === 1 ? '' : 's'} guardado${n === 1 ? '' : 's'} sin conexión. ¿Deseas subirlo${n === 1 ? '' : 's'} ahora?`,
      icon: 'pi pi-cloud-upload',
      acceptLabel: 'Subir ahora',
      rejectLabel: 'Más tarde',
      accept: () => this.store.dispatch(new SyncOfflineReports()),
    });
  }
}
