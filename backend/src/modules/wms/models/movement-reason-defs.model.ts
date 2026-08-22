import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { ReasonContext } from '../enums/movements.enum';

// Movement reasons are DATA, not an enum (master plan §4) — a
// tenant-customizable definition entity. The 14 built-ins
// (`constants/movement-reason-seeds.ts`) are migration-seeded with
// `builtIn: true` and fully locked: no label edits, no deactivation. Custom
// reasons: owner/admin create them from inside the reason select (label +
// appliesTo → server-slugged code), label stays editable, deactivate-only —
// NO DELETE path, ever (inactive reasons disappear from selects but keep
// rendering in history, joined by `code`).
export const movementReasonDefs = pgTable('movement_reason_defs', {
  id: uuid('id').defaultRandom().primaryKey(),
  // IMMUTABLE — auto-slugged from the label server-side (collision → `-2`
  // suffix). `movements.reason` FKs this, so history always resolves.
  code: text('code').notNull().unique(),
  label: text('label').notNull(),
  builtIn: boolean('built_in').notNull().default(false),
  appliesTo: text('applies_to').array().$type<ReasonContext[]>().notNull(),
  // 00 §6 #23 (accepted 2026-07-20): the readjust/consumption validators
  // reject a blank note when the chosen reason sets this
  // (`400 note_required`). Seeded true for `scrap` + `lot_expired`.
  requiresNote: boolean('requires_note').notNull().default(false),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
