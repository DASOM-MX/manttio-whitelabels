import { SignJWT } from 'jose';
import { PORTAL_TOKEN_ALG, PORTAL_TOKEN_TTL } from '../constants/portal-token';

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
    .setProtectedHeader({ alg: PORTAL_TOKEN_ALG })
    .setSubject(portalUserId)
    .setIssuedAt()
    .setExpirationTime(PORTAL_TOKEN_TTL)
    .sign(key);
};
