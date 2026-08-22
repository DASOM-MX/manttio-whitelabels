import type { Db } from '../../database/client';
import { isUniqueViolation } from '../../database/db-errors';
import { BuiltinLockedError } from '../http-errors/movement-reasons.error';
import {
  findMovementReasonById,
  insertMovementReason,
  listCodesLike,
  listMovementReasons,
  updateMovementReasonRow,
} from '../repository/movement-reasons.repository';
import type {
  MovementReasonDTO,
  MovementReasonRow,
  UpdateMovementReasonFields,
} from '../types/movement-reasons.types';
import type {
  CreateMovementReasonInput,
  UpdateMovementReasonInput,
} from '../validators/movement-reasons.validator';

const toDTO = (row: MovementReasonRow): MovementReasonDTO => ({
  id: row.id,
  code: row.code,
  label: row.label,
  builtIn: row.builtIn,
  appliesTo: row.appliesTo,
  requiresNote: row.requiresNote,
  active: row.active,
});

/** The label is what a human typed; the code is what the journal stores
 *  forever, so it is derived here and never accepted from a client. Accents
 *  fold, everything non-alphanumeric collapses to `_`, and the result matches
 *  the snake_case built-ins. */
const slugify = (label: string) => {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
  // A label of pure punctuation still needs a code — the suffix pass below
  // makes it unique.
  return slug === '' ? 'motivo' : slug;
};

/** `-2`, `-3`, … as the model records (01 §2). The dash is deliberate: it makes
 *  a disambiguating suffix visibly not part of the slugged label. */
const freeCode = (base: string, taken: string[]): string => {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error(`no free code for ${base}`);
};

export const getMovementReasons = async (db: Db): Promise<{ reasons: MovementReasonDTO[] }> => ({
  reasons: (await listMovementReasons(db)).map(toDTO),
});

export const createMovementReason = async (
  db: Db,
  input: CreateMovementReasonInput,
): Promise<MovementReasonDTO> => {
  const base = slugify(input.label);

  // Two admins adding a reason with the same label at the same moment both
  // read the same free code; the unique index catches the loser and a re-scan
  // hands it the next one. Bounded, because each retry sees one more taken
  // code than the last.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const code = freeCode(base, await listCodesLike(db, base));
    try {
      const row = await insertMovementReason(db, {
        code,
        label: input.label,
        appliesTo: input.appliesTo,
        // Custom reasons never force a note: the two that do are built-ins
        // (00 §6 #23), and making it configurable was not asked for.
        requiresNote: false,
        builtIn: false,
        active: true,
      });
      return toDTO(row);
    } catch (err) {
      if (!isUniqueViolation(err) || attempt === 2) throw err;
    }
  }
  throw new Error('unreachable');
};

export const editMovementReason = async (
  db: Db,
  id: string,
  input: UpdateMovementReasonInput,
): Promise<MovementReasonDTO | null> => {
  const current = await findMovementReasonById(db, id);
  if (!current) return null;
  // Built-ins are what history was validated against and what the frontend
  // special-cases by code — locked outright (01 §5).
  if (current.builtIn) throw new BuiltinLockedError(current.code);

  const fields: UpdateMovementReasonFields = {};
  if (input.label !== undefined) fields.label = input.label;
  if (input.active !== undefined) fields.active = input.active;
  // Drizzle refuses an empty `.set({})`, and a form submitted unchanged is a
  // no-op, not a 500.
  if (Object.keys(fields).length === 0) return toDTO(current);

  const row = await updateMovementReasonRow(db, id, fields);
  return row ? toDTO(row) : null;
};
