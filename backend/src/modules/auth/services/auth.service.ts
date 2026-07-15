import type { Db } from '../../database/client';
import { findUserByEmail, updateUser } from '../../users/repository/users.repository';
import { getUserById } from '../../users/services/users.service';
import { hashPassword, verifyPassword } from './password.service';
import { signAuthToken } from './jwt.service';
import type { LoginInput } from '../validators/auth.validator';
import type { MeResponse } from '../dtos/me.dto';

export type LoginResult = { token: string; mustChangePassword: boolean };

// Verifies credentials and returns a signed JWT, or null when they don't match
// (the caller maps null → 401 invalid_credentials). Registration is closed:
// only admins create users via POST /users. `mustChangePassword` rides the
// response so clients can interpose the forced-change dialog right after
// login (backend plan §1 — `/auth/me` will carry it too when it lands).
export const login = async (
  db: Db,
  { email, password }: LoginInput,
  secret: string,
  environment: string,
): Promise<LoginResult | null> => {
  const user = await findUserByEmail(db, email);
  if (!user) return null;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  const token = await signAuthToken(secret, environment, { id: user.id, role: user.role });
  return { token, mustChangePassword: user.mustChangePassword };
};

// Session snapshot for GET /auth/me (backend plan §1): user + role +
// mustChangePassword in one read. Returns null when the token's user no
// longer exists (deleted since issue). Deliberately no tenantConfig — the
// module-flag feature is a pending item (see dtos/me.dto.ts).
export const getMe = async (db: Db, userId: string): Promise<MeResponse | null> => {
  const user = await getUserById(db, userId);
  if (!user) return null;
  return {
    user: { id: user.id, name: user.name, email: user.email },
    role: user.role,
    mustChangePassword: user.mustChangePassword,
  };
};

// Change-own password for the forced-change flow (backend plan §1): rehash and
// clear the flag. The caller is already JWT-authenticated (they just logged in
// with the temp password), so only the new password is required — matches the
// superadmin dialog's contract. Returns false when the user no longer exists.
export const changeOwnPassword = async (
  db: Db,
  userId: string,
  password: string,
): Promise<boolean> => {
  const passwordHash = await hashPassword(password);
  const row = await updateUser(db, userId, { passwordHash, mustChangePassword: false });
  return row !== null;
};
