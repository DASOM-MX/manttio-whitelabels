import type { MiddlewareHandler, Next } from 'hono';
import type { AppBindings } from '../../../env';

// The whitelabel manager authenticates config pushes with a shared token —
// never a product JWT (backend plan §1 system map). Verified with a
// constant-time compare against the MANAGER_SHARED_TOKEN secret; fail-closed
// when the secret is unset.
export const MANAGER_TOKEN_HEADER = 'X-Manager-Token';

const timingSafeEqual = (a: string, b: string): boolean => {
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let diff = aBytes.length ^ bBytes.length;
  const length = Math.max(aBytes.length, bBytes.length);
  for (let i = 0; i < length; i++) {
    diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0);
  }
  return diff === 0;
};

// Admit the manager's shared token, or run the product-auth chain when the
// header is absent — e.g. `managerOr(jwtMiddleware, requireRole(['owner']))`.
// A present-but-wrong token 401s; it never falls through to JWT. Manager
// requests set no `user` on the context — downstream handlers that need an
// acting product user must not sit behind this guard.
export const managerOr = (
  ...fallbacks: MiddlewareHandler<AppBindings>[]
): MiddlewareHandler<AppBindings> => {
  return async (c, next) => {
    const token = c.req.header(MANAGER_TOKEN_HEADER);
    if (token !== undefined) {
      const secret = c.env.MANAGER_SHARED_TOKEN;
      if (!secret || !timingSafeEqual(token, secret)) {
        return c.json({ error: 'unauthorized' }, 401);
      }
      return next();
    }
    // Mirror Hono's composer: a fallback that responds without calling next()
    // returns its Response, but outer fallbacks (e.g. jwtMiddleware) discard
    // next()'s return value — so capture responses into c.res instead.
    const run = async (i: number): Promise<void> => {
      if (i >= fallbacks.length) {
        await next();
        return;
      }
      const res = await fallbacks[i]!(c, (() => run(i + 1)) as Next);
      if (res instanceof Response) c.res = res;
    };
    await run(0);
  };
};
