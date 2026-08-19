import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { requireRole } from '../../auth/middleware/roles.middleware';
import {
  InvalidRecipientError,
  QuotationClosedError,
  QuotationDiscountTooLargeError,
  QuotationNotDraftError,
  QuotationNotLiveError,
  QuotationReminderNotApplicableError,
  QuotationServiceNotFoundError,
} from '../http-errors/quotations.error';
import {
  badRecipientResponse,
  discountTooLargeResponse,
  notDraftResponse,
  notLiveResponse,
  reminderNotApplicableResponse,
  serviceGoneResponse,
} from '../http-errors/quotations.responses';
import {
  cancelQuotationSchema,
  createOrderFromQuotationSchema,
  createQuotationSchema,
  deleteQuotationSchema,
  listQuotationsQuerySchema,
  quotationSettingsSchema,
  remindQuotationSchema,
  sendQuotationSchema,
  updateQuotationSchema,
} from '../validators/quotations.validator';
import { createOrderFromQuotation } from '../../service-orders/services/order-from-quotation.service';
import {
  AssignmentCoverageError,
  ExplosionTooLargeError,
  QuotationApprovalGateError,
  QuotationExpiredError,
  MissingExplosionInputsError,
} from '../../service-orders/http-errors/order-from-quotation.error';
import { InvalidOrderReferenceError, InvalidTemplateError } from '../../service-orders/http-errors/service-orders.error';
import {
  cancelQuotation,
  createQuotationDraft,
  editQuotationDraft,
  getQuotationById,
  getQuotationTimeline,
  getQuotations,
  getSettings,
  remindReviewer,
  removeQuotation,
  saveSettings,
  reviseQuotation,
  sendQuotation,
} from '../services/quotations.service';

export const quotations = new Hono<AppBindings>();

// A malformed :id can never match a uuid PK — 404 up front rather than a
// Postgres 22P02 500 (same idiom as notifications/cms/service-orders). Used by
// the /order route; the older routes predate it.
const quotationIdSchema = z.string().uuid();

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

// Registered before '/:id': 'settings' is a literal segment and must never be
// read as a quotation id (Hono's trie prefers statics, but explicit order
// keeps that true under any router).
quotations.get('/settings', requireRole(['owner', 'admin', 'office']), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getSettings(db));
});

// Writes are owner/admin: the default terms speak for the tenant on every
// quote that leaves the building.
quotations.put(
  '/settings',
  requireRole(['owner', 'admin']),
  zValidator('json', quotationSettingsSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    return c.json(await saveSettings(db, c.req.valid('json').defaultComments, c.get('user').id));
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
      if (err instanceof QuotationDiscountTooLargeError) return discountTooLargeResponse(c, err);
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
      if (err instanceof QuotationDiscountTooLargeError) return discountTooLargeResponse(c, err);
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

// Nudge one pending reviewer (PR-C) — same token, reminder email, own
// timeline entry. 409s name what's wrong instead of pretending it went out.
quotations.post(
  '/:id/remind',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', remindQuotationSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    try {
      const result = await remindReviewer(
        db,
        c.env,
        c.req.param('id'),
        c.req.valid('json').contactId,
        c.get('user').id,
      );
      if (!result) return c.json({ error: 'not_found' }, 404);
      return c.json(result);
    } catch (err) {
      if (err instanceof QuotationNotLiveError) return notLiveResponse(c);
      if (err instanceof QuotationClosedError) {
        return c.json(
          {
            error: 'quotation_closed',
            message: 'La cotización ya venció — revísala para poder recordar a los revisores.',
          },
          409,
        );
      }
      if (err instanceof InvalidRecipientError) return badRecipientResponse(c, err);
      if (err instanceof QuotationReminderNotApplicableError) {
        return reminderNotApplicableResponse(c, err);
      }
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

// The convergence (20 §6): staff open the service order this quote was
// accepted for — frozen line snapshots inherited, reports exploded, quote
// flipped to `order_created`, both timelines written, one transaction. The
// conversion logic lives in the service-orders module (it owns the order
// invariants); this route owns the HTTP mapping.
quotations.post(
  '/:id/order',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', createOrderFromQuotationSchema),
  async (c) => {
    const id = quotationIdSchema.safeParse(c.req.param('id'));
    if (!id.success) return c.json({ error: 'not_found' }, 404);
    const db = createDb(c.env.DATABASE_URL);
    try {
      const order = await createOrderFromQuotation(db, c.get('user'), id.data, c.req.valid('json'));
      if (!order) return c.json({ error: 'not_found' }, 404);
      return c.json({ order }, 201);
    } catch (err) {
      if (err instanceof QuotationNotLiveError) return notLiveResponse(c);
      if (err instanceof QuotationExpiredError) {
        return c.json(
          {
            error: 'quotation_expired',
            message: 'La cotización venció; revísala para cotizar con precios vigentes.',
            validUntil: err.validUntil,
          },
          409,
        );
      }
      if (err instanceof QuotationApprovalGateError) {
        return c.json(
          {
            error: 'approval_required',
            message:
              'La cotización no tiene aprobaciones; solo el propietario o un administrador puede convertirla.',
          },
          403,
        );
      }
      if (err instanceof MissingExplosionInputsError) {
        return c.json(
          {
            error: 'missing_explosion_inputs',
            message: `La partida "${err.serviceName}" genera reportes: asigna técnico y plantilla.`,
            serviceName: err.serviceName,
          },
          422,
        );
      }
      if (err instanceof AssignmentCoverageError) {
        return c.json(
          {
            error: 'assignment_coverage',
            message: 'Las asignaciones no cubren exactamente los servicios de la cotización.',
            missing: err.missing,
            unknown: err.unknown,
          },
          422,
        );
      }
      if (err instanceof ExplosionTooLargeError) {
        return c.json(
          {
            error: 'explosion_too_large',
            message: `La cotización generaría ${err.totalUnits} reportes; el máximo por orden es 50.`,
          },
          409,
        );
      }
      if (err instanceof InvalidOrderReferenceError) {
        return c.json({ error: 'invalid_reference', message: err.message }, 422);
      }
      if (err instanceof InvalidTemplateError) {
        return c.json({ error: 'invalid_template', message: err.message }, 400);
      }
      throw err;
    }
  },
);

// Audited soft delete — admin-tier only, so office can retire a quote with
// `/cancel` (a lifecycle decision, visible to the client) but not remove it
// from the tenant's lists. Allowed from any state, terminal ones included:
// this is housekeeping, not a lifecycle step. Nothing is ever hard-deleted —
// the row and its whole timeline stay, and every read filters them out,
// including the recipient-token lookup, so the mailed links stop resolving.
quotations.delete(
  '/:id',
  requireRole(['owner', 'admin']),
  zValidator('json', deleteQuotationSchema),
  async (c) => {
    const db = createDb(c.env.DATABASE_URL);
    const row = await removeQuotation(
      db,
      c.req.param('id'),
      c.req.valid('json').deleteComment,
      c.get('user').id,
    );
    if (!row) return c.json({ error: 'not_found' }, 404);
    return c.json({ id: row.id, deleted: true });
  },
);

// `POST /:id/order` (20 §6) is absent until 19 lands — it has to open a
// `service_order` in the same transaction, and that table does not exist yet
// (owner 2026-07-26). `order_created` is therefore unreachable, which is the
// honest state: no order can exist to point at.
