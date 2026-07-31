import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { getBrand } from '../../brand/services/brand.service';
import { NotAReviewerError, QuotationClosedError } from '../http-errors/quotations.error';
import {
  notAReviewerResponse,
  quotationClosedResponse,
} from '../http-errors/quotations.responses';
import { respondQuotationSchema } from '../validators/quotations.validator';
import {
  getQuotationByToken,
  getQuotationPdfByToken,
  respondToQuotation,
} from '../services/quotations.service';
import {
  renderQuotationApprovalPage,
  type ApprovalPageError,
} from '../helpers/quotation-approval-page.helpers';

// The token-guarded client surface (20 §4). Mounted BEFORE the JWT middleware —
// the recipient is a client contact with no account, and the URL itself is the
// secret, exactly like `/reports/download/{token}`.
//
// CP-3: `GET /:token` serves the server-rendered approval page to anything that
// asks for HTML (a mailed link opened in a browser), and keeps the CP-1 JSON
// for API callers — same route, so links already in inboxes kept working
// through the transition. The page's form POSTs `/respond` as form-data and is
// answered with a redirect (PRG); the JSON `/respond` contract is unchanged.
export const publicQuotations = new Hono<AppBindings>();

// A bad token is 404, never 401/403: distinguishing "no such token" from "not
// yours" would confirm which tokens exist to anyone probing.
const NOT_FOUND = { error: 'not_found' } as const;

const PAGE_ERRORS: ApprovalPageError[] = ['reason_required', 'invalid', 'not_a_reviewer', 'closed'];

const pageError = (raw: string | undefined): ApprovalPageError | undefined =>
  PAGE_ERRORS.find((code) => code === raw);

publicQuotations.get('/:token', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const view = await getQuotationByToken(db, c.req.param('token'));
  if (!view) return c.json(NOT_FOUND, 404);
  // Browsers say text/html; everything else (the superadmin, tests, curl)
  // keeps the CP-1 JSON.
  if ((c.req.header('accept') ?? '').includes('text/html')) {
    const brand = await getBrand(db, c.env.LOGOS_CDN_BASE_URL);
    const path = new URL(c.req.url).pathname;
    return c.html(renderQuotationApprovalPage(view, brand, path, pageError(c.req.query('e'))));
  }
  return c.json(view);
});

publicQuotations.get('/:token/pdf', async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const pdf = await getQuotationPdfByToken(db, c.env, c.req.param('token'));
  if (!pdf) return c.json(NOT_FOUND, 404);
  // `Uint8Array<ArrayBufferLike>` vs Hono's `Uint8Array<ArrayBuffer>` — the
  // runtime BodyInit accepts either; the cast only papers over the generic.
  return c.body(pdf.bytes as unknown as ArrayBuffer, 200, {
    'content-type': 'application/pdf',
    'content-disposition': `inline; filename="${pdf.filename}"`,
  });
});

publicQuotations.post('/:token/respond', async (c, next) => {
  // The no-script form path (PRG): the page's <form> posts form-data, and
  // domain refusals become a redirect back to the page with `?e=` — never a
  // dead-end error body a client contact can't act on. JSON callers fall
  // through to the CP-1 contract below.
  if (!(c.req.header('content-type') ?? '').includes('form')) return next();
  const base = new URL(c.req.url).pathname.replace(/\/respond$/, '');
  const body = await c.req.parseBody();
  const reason =
    typeof body['reason'] === 'string' && body['reason'].trim() ? body['reason'].trim() : undefined;
  const parsed = respondQuotationSchema.safeParse({ response: body['response'], reason });
  if (!parsed.success) {
    const reasonMissing = parsed.error.issues.some((i) => i.path[0] === 'reason');
    return c.redirect(`${base}?e=${reasonMissing ? 'reason_required' : 'invalid'}`, 303);
  }
  const db = createDb(c.env.DATABASE_URL);
  try {
    const view = await respondToQuotation(db, c.req.param('token'), parsed.data);
    if (!view) return c.json(NOT_FOUND, 404);
    return c.redirect(base, 303);
  } catch (err) {
    if (err instanceof NotAReviewerError) return c.redirect(`${base}?e=not_a_reviewer`, 303);
    if (err instanceof QuotationClosedError) return c.redirect(`${base}?e=closed`, 303);
    throw err;
  }
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
