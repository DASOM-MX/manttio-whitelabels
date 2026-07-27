import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { NotAReviewerError, QuotationClosedError } from '../http-errors/quotations.error';
import {
  notAReviewerResponse,
  quotationClosedResponse,
} from '../http-errors/quotations.responses';
import { respondQuotationSchema } from '../validators/quotations.validator';
import { getQuotationByToken, respondToQuotation } from '../services/quotations.service';

// The token-guarded client surface (20 §4). Mounted BEFORE the JWT middleware —
// the recipient is a client contact with no account, and the URL itself is the
// secret, exactly like `/reports/download/{token}`.
//
// CP-1 answers JSON; CP-3 replaces `GET` with the server-rendered approval page
// (markup in `templates/`, renderer in `helpers/`) on this same route, so the
// link already mailed to a recipient keeps working when that lands.
export const publicQuotations = new Hono<AppBindings>();

// A bad token is 404, never 401/403: distinguishing "no such token" from "not
// yours" would confirm which tokens exist to anyone probing.
const NOT_FOUND = { error: 'not_found' } as const;

publicQuotations.get('/:token', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const view = await getQuotationByToken(db, c.req.param('token'));
  if (!view) return c.json(NOT_FOUND, 404);
  return c.json(view);
});

publicQuotations.post('/:token/respond', zValidator('json', respondQuotationSchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    const view = await respondToQuotation(db, c.req.param('token'), c.req.valid('json'));
    if (!view) return c.json(NOT_FOUND, 404);
    // The response body carries the re-derived state, so the page can reflect
    // the new tally without a second request.
    return c.json(view);
  } catch (err) {
    if (err instanceof NotAReviewerError) return notAReviewerResponse(c);
    if (err instanceof QuotationClosedError) return quotationClosedResponse(c, err);
    throw err;
  }
});
