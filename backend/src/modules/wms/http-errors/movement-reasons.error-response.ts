import type { Context } from 'hono';
import type { AppBindings } from '../../../env';
import { BuiltinLockedError } from './movement-reasons.error';

/** Movement-reason domain errors → `{ error, message }` (02 §9). Anything
 *  unrecognized is rethrown so real faults still reach the global handler. */
export const movementReasonErrorResponse = (c: Context<AppBindings>, err: unknown) => {
  if (err instanceof BuiltinLockedError) {
    return c.json(
      {
        error: 'builtin_locked',
        message: 'Los motivos predefinidos no pueden editarse ni desactivarse.',
      },
      403,
    );
  }
  throw err;
};
