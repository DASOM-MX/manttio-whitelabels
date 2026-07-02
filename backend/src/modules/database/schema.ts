// Schema barrel. Drizzle Kit (drizzle.config.ts) and the DB client both read the schema
// from this single entry point.
//
// TEMPORARY (Phase 1): passes through the legacy `src/db/schema.ts`. In Phase 2 this file
// becomes the real barrel — re-exporting each module's `models/*.model.ts` tables and
// defining all cross-module `relations()` here.
export * from '../../db/schema';
