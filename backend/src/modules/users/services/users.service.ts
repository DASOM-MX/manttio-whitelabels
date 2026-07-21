import type { Db } from '../../database/client';
import type { AuthUser } from '../../../env';
import { isUniqueViolation } from '../../database/db-errors';
import { hashPassword } from '../../auth/services/password.service';
import {
  findUserById,
  insertUser,
  listUsers,
  softDeleteUser,
  updateUser,
} from '../repository/users.repository';
import { toPublicUser, type PublicUser } from '../dtos/users.dto';
import { PASSWORD_RESET_PAIRINGS } from '../enums/users.enum';
import { generateTempPassword } from '../utils/temp-password';
import type { UpdateUserFields } from '../types/users.types';
import type { CreateUserInput, UpdateUserInput } from '../validators/users.validator';

// Thrown when an insert/update collides with the active-email unique index; the
// controller maps it to 409 email_in_use.
export class EmailInUseError extends Error {}
// Thrown when an admin tries to delete their own account; controller → 400.
export class CannotDeleteSelfError extends Error {}
// Thrown when a mutation targets an `owner` row — the owner is never
// editable/deletable in-tenant (backend plan §1); controller → 403.
export class CannotModifyOwnerError extends Error {}
// Thrown when the actor→target pairing isn't in PASSWORD_RESET_PAIRINGS
// (backend plan §1); controller → 403.
export class CannotResetPasswordError extends Error {}

export const getUserById = async (db: Db, id: string): Promise<PublicUser | null> => {
  const user = await findUserById(db, id);
  return user ? toPublicUser(user) : null;
};

export const getUsers = async (db: Db): Promise<PublicUser[]> => {
  const rows = await listUsers(db);
  return rows.map(toPublicUser);
};

// Temp-password model (backend plan §1): with no password supplied, generate
// one, flag the forced change, and hand it back exactly once — the response is
// the only place it ever appears (no email flow; the creator relays it).
export const createUser = async (
  db: Db,
  input: CreateUserInput,
): Promise<{ user: PublicUser; tempPassword?: string }> => {
  const generated = input.password === undefined;
  const plainPassword = input.password ?? generateTempPassword();
  const passwordHash = await hashPassword(plainPassword);
  try {
    const row = await insertUser(db, {
      name: input.name,
      paternalLastName: input.paternalLastName ?? null,
      maternalLastName: input.maternalLastName ?? null,
      email: input.email,
      passwordHash,
      role: input.role,
      mustChangePassword: generated,
    });
    return { user: toPublicUser(row), ...(generated ? { tempPassword: plainPassword } : {}) };
  } catch (err) {
    if (isUniqueViolation(err)) throw new EmailInUseError();
    throw err;
  }
};

// Role-gated reset (backend plan §1): pairing enforced here, on top of the
// route's admin-tier gate. Issues a fresh temp password and flags the forced
// change; the old password stops working immediately.
export const resetUserPassword = async (
  db: Db,
  actor: AuthUser,
  id: string,
): Promise<{ tempPassword: string } | null> => {
  const target = await findUserById(db, id);
  if (!target) return null;
  if (!PASSWORD_RESET_PAIRINGS[actor.role].includes(target.role)) {
    throw new CannotResetPasswordError();
  }
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const row = await updateUser(db, id, { passwordHash, mustChangePassword: true });
  return row ? { tempPassword } : null;
};

export const editUser = async (
  db: Db,
  id: string,
  input: UpdateUserInput,
): Promise<PublicUser | null> => {
  const target = await findUserById(db, id);
  if (!target) return null;
  if (target.role === 'owner') throw new CannotModifyOwnerError();

  const fields: UpdateUserFields = {};
  if (input.name !== undefined) fields.name = input.name;
  if (input.paternalLastName !== undefined) fields.paternalLastName = input.paternalLastName;
  if (input.maternalLastName !== undefined) fields.maternalLastName = input.maternalLastName;
  if (input.email !== undefined) fields.email = input.email;
  if (input.role !== undefined) fields.role = input.role;
  if (input.password !== undefined) fields.passwordHash = await hashPassword(input.password);

  try {
    const row = await updateUser(db, id, fields);
    return row ? toPublicUser(row) : null;
  } catch (err) {
    if (isUniqueViolation(err)) throw new EmailInUseError();
    throw err;
  }
};

export const removeUser = async (
  db: Db,
  id: string,
  actorId: string,
  deleteComment: string,
): Promise<{ id: string } | null> => {
  if (actorId === id) throw new CannotDeleteSelfError();
  const target = await findUserById(db, id);
  if (!target) return null;
  if (target.role === 'owner') throw new CannotModifyOwnerError();
  return softDeleteUser(db, id, deleteComment, actorId);
};
