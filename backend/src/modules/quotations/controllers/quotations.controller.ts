import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import {
  InvalidRecipientError,
  QuotationNotDraftError,
  QuotationNotLiveError,
  QuotationServiceNotFoundError,
} from '../http-errors/quotations.error';
import {
  badRecipientResponse,
  notDraftResponse,
  notLiveResponse,
  serviceGoneResponse,
} from '../http-errors/quotations.responses';
import {
  cancelQuotationSchema,
  createQuotationSchema,
  listQuotationsQuerySchema,
  sendQuotationSchema,
  updateQuotationSchema,
} from '../validators/quotations.validator';
import {
  cancelQuotation,
  createQuotationDraft,
  editQuotationDraft,
  getQuotationById,
  getQuotationTimeline,
  getQuotations,
  reviseQuotation,
  sendQuotation,
} from '../services/quotations.service';

export const quotations = new Hono<AppBindings>();

// Every route is owner/admin/office (20 §7). Technicians have no quotation
// surface at all — not even read: pricing and margin are commercial
// information, and the field app never needs them.

quotations.get(
  '/',
  requireRole(['owner', 'admin', 'office']),
  zValidator('query', listQuotationsQuerySchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    return c.json(await getQuotations(db, c.req.valid('query')));
  },
);

quotations.get('/:id', requireRole(['owner', 'admin', 'office']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const row = await getQuotationById(db, c.req.param('id'));
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(row);
});

quotations.get('/:id/timeline', requireRole(['owner', 'admin', 'office']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  const id = c.req.param('id');
  // Existence is checked against the quote, not the event list: a quote with an
  // empty timeline is impossible (creation writes one), but a soft-deleted one
  // would otherwise leak its history through this route.
  const row = await getQuotationById(db, id);
  if (!row) return c.json({ error: 'not_found' }, 404);
  return c.json(await getQuotationTimeline(db, id));
});

quotations.post(
  '/',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', createQuotationSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await createQuotationDraft(db, c.req.valid('json'), c.get('user').id);
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row, 201);
    } catch (err) {
      if (err instanceof QuotationServiceNotFoundError) return serviceGoneResponse(c, err);
      throw err;
    }
  },
);

quotations.patch(
  '/:id',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', updateQuotationSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await editQuotationDraft(db, c.req.param('id'), c.req.valid('json'));
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    } catch (err) {
      if (err instanceof QuotationNotDraftError) return notDraftResponse(c);
      if (err instanceof QuotationServiceNotFoundError) return serviceGoneResponse(c, err);
      throw err;
    }
  },
);

quotations.post(
  '/:id/send',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', sendQuotationSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const result = await sendQuotation(
        db,
        c.env,
        c.req.param('id'),
        c.req.valid('json'),
        c.get('user').id,
      );
      if (!result) return c.json({ error: 'not_found' }, 404);
      // 200 even when some addresses bounced: the send is committed and the
      // body names every failure, which is more useful than an error status
      // that hides the recipients who did receive it.
      return c.json(result);
    } catch (err) {
      if (err instanceof QuotationNotLiveError) return notLiveResponse(c);
      if (err instanceof InvalidRecipientError) return badRecipientResponse(c, err);
      throw err;
    }
  },
);

quotations.post('/:id/revise', requireRole(['owner', 'admin', 'office']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  try {
    const row = await reviseQuotation(db, c.req.param('id'), c.get('user').id);
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json(row, 201);
  } catch (err) {
    if (err instanceof QuotationNotLiveError) return notLiveResponse(c);
    if (err instanceof QuotationServiceNotFoundError) return serviceGoneResponse(c, err);
    throw err;
  }
});

quotations.post(
  '/:id/cancel',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', cancelQuotationSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const row = await cancelQuotation(
        db,
        c.req.param('id'),
        c.req.valid('json').comment,
        c.get('user').id,
      );
      if (!row) return c.json({ error: 'not_found' }, 404);
      return c.json(row);
    } catch (err) {
      if (err instanceof QuotationNotLiveError) return notLiveResponse(c);
      throw err;
    }
  },
);

// `POST /:id/order` (20 §6) is absent until 19 lands — it has to open a
// `service_order` in the same transaction, and that table does not exist yet
// (owner 2026-07-26). `order_created` is therefore unreachable, which is the
// honest state: no order can exist to point at.
