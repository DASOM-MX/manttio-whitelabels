import type { Db } from '../../database/client';
import { findUserByEmail } from '../../users/repository/users.repository';
import { verifyPassword } from './password.service';
import { signAuthToken } from './jwt.service';
import type { LoginInput } from '../validators/auth.validator';

// Verifies credentials and returns a signed JWT, or null when they don't match
// (the caller maps null → 401 invalid_credentials). Registration is closed:
// only admins create users via POST /users.
export const login = async (
  db: Db,
  { email, password }: LoginInput,
  secret: string,
  environment: string,
): Promise<string | null> => {
  const user = await findUserByEmail(db, email);
  if (!user) return null;

  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;

  return signAuthToken(secret, environment, { id: user.id, role: user.role });
};
