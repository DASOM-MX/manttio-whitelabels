import type { Db } from '../../database/client';
import {
  cancelServiceRequest,
  createServiceRequest,
  findServiceRequestById,
  listServiceRequestEvents,
  listServiceRequestsForCustomer,
  updateServiceRequestStatus,
  appendEvents,
} from '../repository/service-requests.repository';
import { isValidStatusTransition } from '../utils/status-transition';
import { ServiceRequestStatus, ServiceRequestEventType } from '../enums/service-requests.enum';
import {
  InvalidStatusTransitionError,
  NotInNeedsInfoError,
  NotAnAdminError,
  ServiceRequestHasOrderError,
} from '../http-errors/service-requests.error';
import { findOrderedQuotationsForServiceRequest } from '../../quotations/repository/quotations.repository';
import type {
  CreateServiceRequestInput,
  AnswerServiceRequestInput,
  CancelServiceRequestInput,
} from '../validators/service-requests.validator';
import type { ListServiceRequestsQuery } from '../validators/list-service-requests-query.validator';
import type {
  ServiceRequestSummaryDTO,
  ServiceRequestDetailDTO,
  ServiceRequestEventDTO,
} from '../dtos/service-requests.dto';
import type { GenericQueryResponse } from '../../shared/types/generic-query-response.types';

const toSummaryDTO = (row: any): ServiceRequestSummaryDTO => ({
  id: row.id,
  folio: row.folio,
  status: row.status,
  equipmentId: row.equipmentId ?? undefined,
  description: row.description,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

const toEventDTO = (row: any): ServiceRequestEventDTO => ({
  seq: row.seq,
  id: row.id,
  type: row.type,
  portalUserId: row.portalUserId ?? undefined,
  note: row.note ?? undefined,
  createdAt: row.createdAt.toISOString(),
});

const toDetailDTO = (request: any, events: any[]): ServiceRequestDetailDTO => ({
  ...toSummaryDTO(request),
  contactId: request.contactId,
  evidence: request.evidence,
  closedAt: request.closedAt?.toISOString(),
  cancelledAt: request.deletedAt?.toISOString(),
  events: events.map(toEventDTO),
});

/**
 * Create a new service request. The insert and its created event are one transaction.
 * `customerId` and `contactId` come from the context, never the body.
 */
export const createRequest = async (
  db: Db,
  input: CreateServiceRequestInput,
  portalUserId: string,
  customerId: string,
  contactId: string,
): Promise<ServiceRequestSummaryDTO> => {
  const request = await createServiceRequest(
    db,
    {
      customerId,
      contactId,
      portalUserId,
      equipmentId: input.equipmentId ?? null,
      description: input.description,
      evidence: input.evidence ?? [],
    },
    portalUserId,
  );

  return toSummaryDTO(request);
};

/**
 * List requests for a customer, newest first. Cancelled requests appear only
 * when asked for by status (owner, 2026-09-03).
 */
export const listRequests = async (
  db: Db,
  customerId: string,
  q: ListServiceRequestsQuery,
): Promise<GenericQueryResponse<ServiceRequestSummaryDTO>> => {
  const page = await listServiceRequestsForCustomer(db, customerId, q);
  return { ...page, items: page.items.map(toSummaryDTO) };
};

/**
 * Get a request with its full event timeline. Scope is enforced in the query.
 */
export const getRequestDetail = async (
  db: Db,
  requestId: string,
  customerId: string,
): Promise<ServiceRequestDetailDTO | null> => {
  const request = await findServiceRequestById(db, requestId, customerId);
  if (!request) {
    return null;
  }

  const events = await listServiceRequestEvents(db, requestId);
  return toDetailDTO(request, events);
};

/**
 * Answer a needs_info request. Appends `info_provided` event and transitions
 * back to `in_review`. Scope is enforced in the query.
 */
export const answerRequest = async (
  db: Db,
  requestId: string,
  customerId: string,
  portalUserId: string,
  input: AnswerServiceRequestInput,
): Promise<ServiceRequestDetailDTO | null> => {
  // Load and scope-check the request.
  const request = await findServiceRequestById(db, requestId, customerId);
  if (!request) {
    return null;
  }

  // Must be in needs_info state.
  if (request.status !== ServiceRequestStatus.NeedsInfo) {
    throw new NotInNeedsInfoError();
  }

  // Validate the transition (should always be valid from needs_info → in_review).
  if (!isValidStatusTransition(request.status, ServiceRequestStatus.InReview, false)) {
    throw new InvalidStatusTransitionError(request.status, ServiceRequestStatus.InReview);
  }

  // Update status and append the info_provided event in one transaction.
  const updated = await updateServiceRequestStatus(
    db,
    requestId,
    customerId,
    ServiceRequestStatus.InReview,
    {
      type: ServiceRequestEventType.InfoProvided,
      portalUserId,
      note: input.answer,
    },
  );

  if (!updated) return null;

  // Reload and return the updated detail.
  const events = await listServiceRequestEvents(db, requestId);
  return toDetailDTO(updated, events);
};

/**
 * Withdraw a request (owner, 2026-09-03). Terminal, soft-deleting, and gated by
 * `cancel_service_requests` at the route. The reason is required and lands on
 * the timeline — the row keeps only the timestamp and who did it.
 *
 * Every quotation issued against the request is soft-deleted with it, in the
 * same transaction, carrying `cancelled by client: <reason>` as its
 * `delete_comment` — unless one of them already produced a live service order,
 * in which case the whole cancel is refused (409) and the customer is told to
 * cancel the order first.
 *
 * Returns null for another customer's request and for one already cancelled,
 * both of which the route answers as 404.
 */
export const cancelRequest = async (
  db: Db,
  requestId: string,
  customerId: string,
  portalUserId: string,
  contactId: string,
  input: CancelServiceRequestInput,
): Promise<ServiceRequestDetailDTO | null> => {
  const request = await findServiceRequestById(db, requestId, customerId);
  if (!request) return null;

  if (!isValidStatusTransition(request.status, ServiceRequestStatus.Cancelled, false)) {
    throw new InvalidStatusTransitionError(request.status, ServiceRequestStatus.Cancelled);
  }

  // Refuse outright once the request has produced a live service order: the work
  // is scheduled, and the cascade below would soft-delete the order's own origin
  // document underneath it. The order is what has to be cancelled, and that is
  // staff's to do (owner, 2026-09-03).
  const orderFolios = await findOrderedQuotationsForServiceRequest(db, requestId);
  if (orderFolios.length) {
    throw new ServiceRequestHasOrderError(orderFolios);
  }

  const updated = await cancelServiceRequest(
    db,
    requestId,
    customerId,
    portalUserId,
    contactId,
    input.reason,
  );
  if (!updated) return null;

  const events = await listServiceRequestEvents(db, requestId);
  return toDetailDTO(updated, events);
};
