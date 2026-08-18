import { Injectable } from '@angular/core';
import Dexie, { type Table } from 'dexie';
import type { PendingReport } from './pending-report.model';
import type { PendingVisitAction } from './pending-visit-action.model';
import type { CachedReportTemplate, TemplateCacheMeta } from './template-cache-meta.model';

/** The device's offline queue database (12 CP-3 renamed it from
 *  `OfflineReportsDb` when visits joined — same `manttio-offline` IndexedDB,
 *  now shared by stores):
 *
 *  - `pendingReports` (v1) — reports captured offline, awaiting upload.
 *  - `pendingVisitActions` (v2) — Iniciar/Terminar/Cerrar taps, awaiting sync.
 *  - `reportTemplates` (v3) — cached report templates for offline capture.
 *  - `templateCacheMeta` (v3) — provenance for that cache (one row).
 *
 *  Each store string lists only the indexed columns; the rest of a record
 *  is stored but not indexed — so a cached template carries its whole
 *  `sections` doc (datatypes, options, units, constraints) even though only
 *  four fields are indexed. That is what lets the capture form render offline.
 *  Injectable so all queue/cache services share one Dexie connection rather
 *  than racing multiple instances through version upgrades. */
@Injectable({ providedIn: 'root' })
export class OfflineDb extends Dexie {
  pendingReports!: Table<PendingReport, string>;
  pendingVisitActions!: Table<PendingVisitAction, string>;
  reportTemplates!: Table<CachedReportTemplate, string>;
  templateCacheMeta!: Table<TemplateCacheMeta, string>;

  constructor() {
    super('manttio-offline');
    this.version(1).stores({
      pendingReports: 'tempId, status, createdAt',
    });
    // Unlisted stores carry forward — v2 only declares what it adds.
    this.version(2).stores({
      pendingVisitActions: 'tempId, visitId, status, at',
    });
    // Unlisted stores carry forward — v3 only declares what it adds.
    // `cachedAt` is indexed so staleness can be queried without a full scan.
    this.version(3).stores({
      reportTemplates: 'id, updatedAt, status, cachedAt',
      templateCacheMeta: 'key',
    });
  }
}
