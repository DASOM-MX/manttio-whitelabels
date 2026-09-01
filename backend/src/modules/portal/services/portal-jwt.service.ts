import { SignJWT } from 'jose';

const ALG = 'HS256';
// A2: 2 days for portal tokens (owner 2026-08-30).
const TTL = '2d';

export type PortalTokenPayload = {
  sub: string; // portal user ID
  cid: string; // customer ID
  typ: 'portal';
};

export const signPortalToken = async (
  secret: string,
  portalUserId: string,
  customerId: string,
): Promise<string> => {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ cid: customerId, typ: 'portal' })
    .setProtectedHeader({ alg: ALG })
    .setSubject(portalUserId)
    .setIssuedAt()
    .setExpirationTime(TTL)
    .sign(key);
};
