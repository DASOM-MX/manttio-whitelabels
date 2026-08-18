import type { VisitFieldChanges } from '../types/visit-audit.types';

/** Builds the `{ field: { from, to } }` diff the order timeline stores for
 *  corrections and reassignments, keeping only the fields that actually moved.
 *  Returns `undefined` when nothing differs, so callers can skip the append
 *  entirely — the trail records what changed, never what was merely submitted. */
export const diffFields = <T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): VisitFieldChanges | undefined => {
  const changes: VisitFieldChanges = {};
  for (const [key, next] of Object.entries(after)) {
    const prev = before[key];
    // Dates compare by value, not identity — two `Date`s for the same instant
    // are a no-op correction and must not land in the trail.
    const same =
      prev instanceof Date && next instanceof Date
        ? prev.getTime() === next.getTime()
        : prev === next;
    if (!same) changes[key] = { from: prev ?? null, to: next ?? null };
  }
  return Object.keys(changes).length ? changes : undefined;
};
