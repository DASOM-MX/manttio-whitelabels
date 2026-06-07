import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

/** Thin bridge between `OfflineSyncService` (a root-level singleton) and the
 *  `<app-sync-pending-reports-dialog />` mounted in the App root. Lets the
 *  reconnect trigger flow without coupling either side to the other. */
@Injectable({ providedIn: 'root' })
export class SyncDialogBridge {
  readonly request$ = new Subject<void>();
}
