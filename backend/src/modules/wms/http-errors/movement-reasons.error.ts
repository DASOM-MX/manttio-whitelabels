// Movement-reason domain errors (10-wms/02 §5/§9).

/** The 14 seeded reasons are fully locked: no label edit, no deactivation
 *  (01 §5). They are what history was validated against, and the frontend
 *  special-cases three of their codes by name. */
export class BuiltinLockedError extends Error {
  constructor(public readonly code: string) {
    super(`reason ${code} is built-in`);
    this.name = 'BuiltinLockedError';
  }
}
