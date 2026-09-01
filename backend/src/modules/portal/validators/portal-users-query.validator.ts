import { z } from 'zod';
import { PortalGrant } from '../enums/portal-grants.enum';
import { PortalUserStatus } from '../enums/portal-users.enum';

/** Query params for the tenant-wide list (superadmin 26 §1). Every filter is
 *  optional and every one is also a URL param on the page, because the list
 *  persists its filters in the URL. */
export const listPortalUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  /** Free text over name, surnames and email. */
  search: z.string().trim().min(1).optional(),
  status: z.nativeEnum(PortalUserStatus).optional(),
  customerId: z.string().uuid().optional(),
  /** Narrows to users holding this grant, live rows only. */
  grant: z.nativeEnum(PortalGrant).optional(),
});

export type ListPortalUsersQuery = z.infer<typeof listPortalUsersQuerySchema>;
