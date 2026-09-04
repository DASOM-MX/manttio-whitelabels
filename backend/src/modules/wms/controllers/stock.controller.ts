import { Hono } from 'hono';
import type { Context } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { requireRole } from '../../auth/middleware/roles.middleware';
import { createDb } from '../../database/client';
import { stockErrorResponse } from '../http-errors/stock.error-response';
import { getMovements, inbound, readjust, transfer } from '../services/stock.service';
import {
  inboundSchema,
  listMovementsQuerySchema,
  readjustSchema,
  transferSchema,
} from '../validators/stock.validator';

// The three stock operations + the journal read (10-wms/02 §4).
//
// THERE IS NO `PATCH` OR `DELETE` HERE, on either router, and there never will
// be: `movements` is the append-only journal every balance reconciles against
// (01 §2). A correction is a new `readjustment`, which is why the history can
// be trusted as a record of what actually happened.
export const stock = new Hono<AppBindings>();
export const movements = new Hono<AppBindings>();

/** Field work is the reason this exists (00 §6 #21): a technician on a flaky
 *  link retries a self-checkout, and the replay must return the original
 *  movement rather than doubling a balance. Optional — a desktop caller that
 *  sends none simply gets no replay protection. */
const idempotencyKey = (c: Context<AppBindings>) => {
  const raw = c.req.header('Idempotency-Key')?.trim();
  return raw === undefined || raw === '' ? undefined : raw;
};

const KEY_MAX = 200;

const keyTooLong = (c: Context<AppBindings>) =>
  c.json(
    {
      error: 'invalid_idempotency_key',
      message: `El encabezado Idempotency-Key no puede exceder ${KEY_MAX} caracteres.`,
    },
    400,
  );

/** Receipts are back-office work: a technician receives nothing, they draw from
 *  stock that is already booked. */
stock.post(
  '/inbound',
  requireRole(['owner', 'admin', 'office']),
  zValidator('json', inboundSchema),
  async (c) => {
    const key = idempotencyKey(c);
    if (key && key.length > KEY_MAX) return keyTooLong(c);
    const db = createDb(c.env.DATABASE_URL);
    try {
      return c.json(await inbound(db, c.get('user'), c.req.valid('json'), key), 201);
    } catch (err) {
      return stockErrorResponse(c, err);
    }
  },
);

/** The one operation technicians may run — as self-checkout, whose three
 *  constraints the service enforces (destination, source, reason). */
stock.post(
  '/transfer',
  requireRole(['owner', 'admin', 'office', 'technician']),
  zValidator('json', transferSchema),
  async (c) => {
    const key = idempotencyKey(c);
    if (key && key.length > KEY_MAX) return keyTooLong(c);
    const db = createDb(c.env.DATABASE_URL);
    try {
      return c.json(await transfer(db, c.get('user'), c.req.valid('json'), key), 201);
    } catch (err) {
      return stockErrorResponse(c, err);
    }
  },
);

/** The only correction instrument (master plan §4) — owner/admin, notes
 *  required by the validator. Office may see every adjustment but may not make
 *  one: visibility is not execution (14 §2.1). */
stock.post(
  '/readjust',
  requireRole(['owner', 'admin']),
  zValidator('json', readjustSchema),
  async (c) => {
    const key = idempotencyKey(c);
    if (key && key.length > KEY_MAX) return keyTooLong(c);
    const db = createDb(c.env.DATABASE_URL);
    try {
      return c.json(await readjust(db, c.get('user'), c.req.valid('json'), key), 201);
    } catch (err) {
      return stockErrorResponse(c, err);
    }
  },
);

/** Open to every authenticated role; the SERVICE narrows what a technician
 *  sees (their own van + their own reports) rather than a separate endpoint. */
movements.get('/', zValidator('query', listMovementsQuerySchema), async (c) => {
  const db = createDb(c.env.DATABASE_URL);
  return c.json(await getMovements(db, c.get('user'), c.req.valid('query')));
});
