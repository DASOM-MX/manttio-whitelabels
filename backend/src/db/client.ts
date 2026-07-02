// TEMPORARY re-export shim (Phase 1 of the modular-architecture refactor).
// Canonical location is now `src/modules/database/client.ts`. Removed in Phase 10 once
// all consumers import from the new path.
export * from '../modules/database/client';
