import { z } from 'zod';

/**
 * Query params for listing service requests: page and limit (not offset).
 */
export const listServiceRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListServiceRequestsQuery = z.infer<typeof listServiceRequestsQuerySchema>;
