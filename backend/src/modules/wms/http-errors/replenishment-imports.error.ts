import type { ReplenishmentImportStatus } from '../enums/replenishment-imports.enum';

// Replenishment-import domain errors (10-wms/02 §6/§9). Thrown in
// `services/replenishment-imports.service.ts`, mapped in
// `replenishment-imports.error-response.ts`.

export class ImportNotFoundError extends Error {
  constructor(public readonly importId: string) {
    super(`import ${importId} not found`);
    this.name = 'ImportNotFoundError';
  }
}

/** The upload is not something we can read a header row out of — wrong
 *  extension, empty file, or no delimiter that yields more than one column. */
export class UnparseableFileError extends Error {
  constructor(public readonly detail: string) {
    super(`unparseable file: ${detail}`);
    this.name = 'UnparseableFileError';
  }
}

/** 1 MB (02 §6). A separate code from `unparseable_file`: the file may be
 *  perfectly well-formed and simply too big to belong in this flow. */
export class FileTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super(`file is ${bytes} bytes`);
    this.name = 'FileTooLargeError';
  }
}

/** ONE in-flight import per PARENT warehouse (owner 2026-07-20/21): sub-warehouses
 *  and vans share their parent's slot. Carries the existing import's id so the
 *  client can resume it rather than opening a second. */
export class ImportInProgressError extends Error {
  constructor(public readonly existingImportId: string | null) {
    super('another import is already in flight for this warehouse');
    this.name = 'ImportInProgressError';
  }
}

/** `sku` is required, plus at least one of `quantity` / `serial` / `lot`; every
 *  mapped id must be a field this file actually has. */
export class InvalidMappingError extends Error {
  constructor(public readonly detail: string) {
    super(`invalid mapping: ${detail}`);
    this.name = 'InvalidMappingError';
  }
}

/** The state machine refused the transition. One class, because the four codes
 *  differ only in which state the caller needed to be in — and the caller
 *  needs to be told which. */
export class ImportStateError extends Error {
  constructor(
    public readonly code:
      | 'import_not_pending'
      | 'import_not_ready'
      | 'import_not_rejected'
      | 'import_not_cancellable',
    public readonly status: ReplenishmentImportStatus,
  ) {
    super(`${code} (status is ${status})`);
    this.name = 'ImportStateError';
  }
}

/** A staged line the import does not have (or no longer has). */
export class ImportRowNotFoundError extends Error {
  constructor(public readonly line: number) {
    super(`staged row ${line} not found`);
    this.name = 'ImportRowNotFoundError';
  }
}
