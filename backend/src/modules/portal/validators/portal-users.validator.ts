import { z } from 'zod';
import { PortalGrant } from '../enums/portal-grants.enum';

/** The grant set, enforced server-side — not merely reflected by the UI
 *  (01 §3, superadmin 26 §3).
 *
 *  Two rules, both about states we refuse to represent:
 *  - `approve_quotations` without `view_quotations` would let someone approve a
 *    document they cannot open.
 *  - A repeated grant would hit `portal_user_grants_active_idx` and surface as
 *    an unhandled 23505 rather than a validation error.
 */
const grantList = z
  .array(z.nativeEnum(PortalGrant))
  .refine((g) => new Set(g).size === g.length, {
    message: 'grants must not repeat',
  })
  .refine(
    (g) => !g.includes(PortalGrant.ApproveQuotations) || g.includes(PortalGrant.ViewQuotations),
    { message: 'approve_quotations requires view_quotations' },
  );

export const invitePortalUserSchema = z.object({
  contactId: z.string().uuid('contact_id must be a valid UUID'),
  grants: grantList,
  isAdmin: z.boolean().default(false),
});

export type InvitePortalUserInput = z.infer<typeof invitePortalUserSchema>;

export const updatePortalUserGrantsSchema = z.object({
  grants: grantList,
});

export type UpdatePortalUserGrantsInput = z.infer<typeof updatePortalUserGrantsSchema>;

export const deletePortalUserSchema = z.object({
  // Required, mirroring users/validators/users.validator.ts — 26 §4 calls this
  // "revoke-with-comment", and an optional comment writes NULL into the very
  // audit column the rule exists to fill. Hono passes `{}` for a body-less
  // DELETE, so optional here meant "no body succeeds silently".
  deleteComment: z.string().trim().min(1).max(255),
});

export type DeletePortalUserInput = z.infer<typeof deletePortalUserSchema>;
