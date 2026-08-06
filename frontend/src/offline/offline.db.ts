import { Injectable } from '@angular/core';
import Dexie, { type Table } from 'dexie';
import type { PendingReport } from './pending-report.model';
import type { PendingVisitAction } from './pending-visit-action.model';

/** The device's offline queue database (12 CP-3 renamed it from
 *  `OfflineReportsDb` when visits joined — same `manttio-offline` IndexedDB,
 *  now shared by two stores):
 *
 *  - `pendingReports` (v1) — reports captured offline, awaiting upload.
 *  - `pendingVisitActions` (v2) — Iniciar/Terminar/Cerrar taps, awaiting sync.
 *
 *  Each store string lists only the indexed columns; the rest of a record —
 *  including the blobs inside a report's `fields` — is stored but not indexed.
 *  Injectable so both queue services share one Dexie connection rather than
 *  racing two instances through the version upgrade. */
@Injectable({ providedIn: 'root' })
export class OfflineDb extends Dexie {
  pendingReports!: Table<PendingReport, string>;
  pendingVisitActions!: Table<PendingVisitAction, string>;

  constructor() {
    super('manttio-offline');
    this.version(1).stores({
      pendingReports: 'tempId, status, createdAt',
    });
    // Unlisted stores carry forward — v2 only declares what it adds.
    this.version(2).stores({
      pendingVisitActions: 'tempId, visitId, status, at',
    });
  }
}
