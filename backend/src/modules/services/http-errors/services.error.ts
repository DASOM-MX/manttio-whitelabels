/** `internalServiceCode` is unique across the live catalog (18 §1), so a
 *  duplicate is a conflict rather than a validation failure — the payload is
 *  well-formed, the catalog just already has that code. Controller maps it to
 *  `409 internal_service_code_in_use`. */
export class ServiceCodeInUseError extends Error {
  constructor(public code: string) {
    super(`internal service code already in use: ${code}`);
    this.name = 'ServiceCodeInUseError';
  }
}

/** One entry per failing import row — `index` is the 0-based position in the
 *  submitted `rows`, which the client maps back to its preview line. */
export interface ServiceImportRowError {
  index: number;
  message: string;
}

/** The import is all-or-nothing (18 §6.3): any bad row rejects the whole
 *  file, and the 422 names every failing row — a partial import that
 *  silently skipped rows would read as "imported everything" (the
 *  no-silent-caps rule). */
export class ServiceImportError extends Error {
  constructor(public rows: ServiceImportRowError[]) {
    super(`service import rejected: ${rows.length} row(s) failed validation`);
    this.name = 'ServiceImportError';
  }
}
