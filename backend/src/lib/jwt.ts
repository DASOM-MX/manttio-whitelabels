import { SignJWT } from 'jose';
import type { AuthUser, Environment } from '../env';

const ALG = 'HS256';

const TTLS: Record<Environment, string> = {
  production: '1d',
  dev: '7d',
};

// Defaults to production TTL on unknown env — fail closed (shorter token) rather than open.
export const expiresInForEnv = (env: string): string =>
  env === 'dev' ? TTLS.dev : TTLS.production;

export const signAuthToken = async (
  secret: string,
  environment: string,
  user: AuthUser,
): Promise<string> => {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(expiresInForEnv(environment))
    .sign(key);
};
