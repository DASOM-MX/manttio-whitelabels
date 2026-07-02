// TEMPORARY re-export shim (Phase 2 of the modular-architecture refactor).
// Canonical schema barrel is now `src/modules/database/schema.ts`; tables live in each
// module's `models/*.model.ts`. Removed in Phase 10 once all consumers import the new path.
export * from '../modules/database/schema';
