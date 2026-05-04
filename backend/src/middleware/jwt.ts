import type { MiddlewareHandler } from 'hono';
import { jwtVerify } from 'jose';
import type { AppBindings, AuthUser } from '../env';

const ROLES = ['admin', 'technician'] as const;

// Token-bearer download (§9). PDFs are typically delivered as email attachments, but for
// oversized reports the email contains a download link instead. The link route is gated by
// an unguessable per-recipient token + expiry + revoke flag, not JWT.
const PUBLIC_PATH_PREFIXES = ['/reports/download/'];

export const jwtMiddleware: MiddlewareHandler<AppBindings> = async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (PUBLIC_PATH_PREFIXES.some((p) => path.startsWith(p))) {
    return next();
  }

  const header = c.req.header('authorization');
  if (!header?.startsWith('Bearer ')) {
    return c.json({ error: 'unauthorized' }, 401);
  }

  const token = header.slice('Bearer '.length);
  const secret = new TextEncoder().encode(c.env.JWT_SECRET);

  try {
    const { payload } = await jwtVerify(token, secret);
    const sub = payload.sub;
    const role = payload.role;
    if (typeof sub !== 'string' || typeof role !== 'string' || !ROLES.includes(role as AuthUser['role'])) {
      return c.json({ error: 'unauthorized' }, 401);
    }
    c.set('user', { id: sub, role: role as AuthUser['role'] });
  } catch {
    return c.json({ error: 'unauthorized' }, 401);
  }

  await next();
};
