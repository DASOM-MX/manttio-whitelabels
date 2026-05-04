import type { MiddlewareHandler } from 'hono';
import type { AppBindings, AuthUser } from '../env';

export const requireRole = (...roles: AuthUser['role'][]): MiddlewareHandler<AppBindings> => {
  return async (c, next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role)) {
      return c.json({ error: 'forbidden' }, 403);
    }
    await next();
  };
};
