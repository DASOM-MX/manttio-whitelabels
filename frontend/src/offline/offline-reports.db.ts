import Dexie, { type Table } from 'dexie';
import type { PendingReport } from './pending-report.model';

/** IndexedDB holding reports captured offline and awaiting upload.
 *
 *  The store string lists only the indexed columns (`tempId` primary key,
 *  `status`, `createdAt`); the rest of each record — including the picture and
 *  signature blobs inside `fields` — is stored but not indexed. */
export class OfflineReportsDb extends Dexie {
  pendingReports!: Table<PendingReport, string>;

  constructor() {
    super('manttio-offline');
    this.version(1).stores({
      pendingReports: 'tempId, status, createdAt',
    });
  }
}
