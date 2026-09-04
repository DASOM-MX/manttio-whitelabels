import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import type { AppBindings } from '../../../env';
import { createDb } from '../../database/client';
import { portalJwtMiddleware } from '../../portal/middleware/portal-jwt.middleware';
import { requireGrant } from '../../portal/middleware/portal-grant.middleware';
import { PortalGrant } from '../../portal/enums/portal-grants.enum';
import { UUID_PARAM } from '../../shared/constants/uuid-param';
import {
  createServiceRequestSchema,
  answerServiceRequestSchema,
  cancelServiceRequestSchema,
} from '../validators/service-requests.validator';
import { listServiceRequestsQuerySchema } from '../validators/list-service-requests-query.validator';
import {
  createRequest,
  listRequests,
  getRequestDetail,
  answerRequest,
  cancelRequest,
} from '../services/service-requests.service';
import {
  InvalidStatusTransitionError,
  NotInNeedsInfoError,
  ServiceRequestHasOrderError,
} from '../http-errors/service-requests.error';

export const serviceRequests = new Hono<AppBindings>();

/**
 * POST /portal/service-requests — create a new service request.
 * Grant: `create_service_requests`. `customerId` and `contactId` from token.
 */
serviceRequests.post(
  '/',
  portalJwtMiddleware,
  requireGrant(PortalGrant.CreateServiceRequests),
  zValidator('json', createServiceRequestSchema),
  async (c) => {
    const user = c.get('portalUser');
    const db = createDb(c.env.DATABASE_URL);
    const input = c.req.valid('json');

    const result = await createRequest(
      db,
      input,
      user.id,
      user.customerId,
      user.contactId,
    );
    return c.json(result, 201);
  },
);

/**
 * GET /portal/service-requests — list the customer's requests, newest first.
 * Grant: `create_service_requests` (viewing your own requests is implied by filing them).
 */
serviceRequests.get(
  '/',
  portalJwtMiddleware,
  requireGrant(PortalGrant.CreateServiceRequests),
  zValidator('query', listServiceRequestsQuerySchema),
  async (c) => {
    const user = c.get('portalUser');
    const db = createDb(c.env.DATABASE_URL);
    const query = c.req.valid('query');

    const result = await listRequests(db, user.customerId, query);
    return c.json(result);
  },
);

/**
 * GET /portal/service-requests/:id — detail + timeline for a request.
 * Grant: `create_service_requests`. Another customer's request is 404.
 */
serviceRequests.get(
  `/:id{${UUID_PARAM}}`,
  portalJwtMiddleware,
  requireGrant(PortalGrant.CreateServiceRequests),
  async (c) => {
    const user = c.get('portalUser');
    const db = createDb(c.env.DATABASE_URL);
    const id = c.req.param('id');

    const result = await getRequestDetail(db, id, user.customerId);
    if (!result) {
      return c.json({ error: 'not_found' }, 404);
    }
    return c.json(result);
  },
);

/**
 * POST /portal/service-requests/:id/answer — reply to a needs_info request.
 * Grant: `create_service_requests`. Returns the request to `in_review`.
 */
serviceRequests.post(
  `/:id{${UUID_PARAM}}/answer`,
  portalJwtMiddleware,
  requireGrant(PortalGrant.CreateServiceRequests),
  zValidator('json', answerServiceRequestSchema),
  async (c) => {
    const user = c.get('portalUser');
    const db = createDb(c.env.DATABASE_URL);
    const id = c.req.param('id');
    const input = c.req.valid('json');

    try {
      const result = await answerRequest(db, id, user.customerId, user.id, input);
      if (!result) {
        return c.json({ error: 'not_found' }, 404);
      }
      return c.json(result);
    } catch (err) {
      if (err instanceof InvalidStatusTransitionError) {
        return c.json(
          { error: 'invalid_status_transition', message: err.message },
          400,
        );
      }
      if (err instanceof NotInNeedsInfoError) {
        return c.json(
          { error: 'not_in_needs_info', message: err.message },
          400,
        );
      }
      throw err;
    }
  },
);

/**
 * DELETE /portal/service-requests/:id — the customer withdraws a request.
 *
 * The verb follows the house split: `DELETE /:id` with the reason in the body is
 * how this codebase spells an audited soft delete (quotations, users, customers),
 * while `POST /:id/<verb>` is reserved for lifecycle moves that do *not* remove
 * the row. This one removes, so it is a DELETE.
 *
 * Grant: `cancel_service_requests` (separate from filing one). Terminal: the
 * request leaves the default list and comes back only under `?status=cancelled`.
 * A second cancel is a 404, not a second event. Every quotation issued against
 * the request is soft-deleted with it, in the same transaction — unless one has
 * already produced a live service order, which refuses the cancel with a 409.
 */
serviceRequests.delete(
  `/:id{${UUID_PARAM}}`,
  portalJwtMiddleware,
  requireGrant(PortalGrant.CancelServiceRequests),
  zValidator('json', cancelServiceRequestSchema),
  async (c) => {
    const user = c.get('portalUser');
    const db = createDb(c.env.DATABASE_URL);
    const id = c.req.param('id');
    const input = c.req.valid('json');

    try {
      const result = await cancelRequest(
        db,
        id,
        user.customerId,
        user.id,
        user.contactId,
        input,
      );
      if (!result) {
        return c.json({ error: 'not_found' }, 404);
      }
      return c.json(result);
    } catch (err) {
      // The request already produced a live order — the customer has to cancel
      // that instead, and only staff can. 409, and the message names the folios.
      if (err instanceof ServiceRequestHasOrderError) {
        return c.json(
          {
            error: 'request_has_service_order',
            message: err.message,
            orderFolios: err.orderFolios,
          },
          409,
        );
      }
      if (err instanceof InvalidStatusTransitionError) {
        return c.json({ error: 'invalid_status_transition', message: err.message }, 400);
      }
      throw err;
    }
  },
);
