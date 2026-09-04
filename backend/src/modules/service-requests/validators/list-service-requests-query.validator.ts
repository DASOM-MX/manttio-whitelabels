import { z } from 'zod';
import { ServiceRequestStatus } from '../enums/service-requests.enum';

/**
 * Query params for listing service requests: page, limit (not offset) and an
 * optional status filter. `status=cancelled` is the one read that reaches
 * withdrawn requests — they are soft-deleted and hidden everywhere else
 * (owner, 2026-09-03).
 */
export const listServiceRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: z.nativeEnum(ServiceRequestStatus).optional(),
});

export type ListServiceRequestsQuery = z.infer<typeof listServiceRequestsQuerySchema>;
