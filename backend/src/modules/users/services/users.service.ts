import type { Db } from '../../database/client';
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
import type { UpdateUserFields } from '../types/users.types';
import type { CreateUserInput, UpdateUserInput } from '../validators/users.validator';

// Thrown when an insert/update collides with the active-email unique index; the
// controller maps it to 409 email_in_use.
export class EmailInUseError extends Error {}
// Thrown when an admin tries to delete their own account; controller → 400.
export class CannotDeleteSelfError extends Error {}

export const getUserById = async (db: Db, id: string): Promise<PublicUser | null> => {
  const user = await findUserById(db, id);
  return user ? toPublicUser(user) : null;
};

export const getUsers = async (db: Db): Promise<PublicUser[]> => {
  const rows = await listUsers(db);
  return rows.map(toPublicUser);
};

export const createUser = async (db: Db, input: CreateUserInput): Promise<PublicUser> => {
  const passwordHash = await hashPassword(input.password);
  try {
    const row = await insertUser(db, {
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
    });
    return toPublicUser(row);
  } catch (err) {
    if (isUniqueViolation(err)) throw new EmailInUseError();
    throw err;
  }
};

export const editUser = async (
  db: Db,
  id: string,
  input: UpdateUserInput,
): Promise<PublicUser | null> => {
  const fields: UpdateUserFields = {};
  if (input.name !== undefined) fields.name = input.name;
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
  return softDeleteUser(db, id, deleteComment, actorId);
};
