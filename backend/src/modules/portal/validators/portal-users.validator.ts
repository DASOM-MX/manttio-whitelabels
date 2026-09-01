import { z } from 'zod';
import { PortalGrant } from '../enums/portal-grants.enum';
import { PortalUserStatus } from '../enums/portal-users.enum';

export const invitePortalUserSchema = z.object({
  contactId: z.string().uuid('contact_id must be a valid UUID'),
  grants: z.array(z.nativeEnum(PortalGrant)),
  isAdmin: z.boolean().default(false),
});

export type InvitePortalUserInput = z.infer<typeof invitePortalUserSchema>;

export const updatePortalUserGrantsSchema = z.object({
  grants: z.array(z.nativeEnum(PortalGrant)),
});

export type UpdatePortalUserGrantsInput = z.infer<typeof updatePortalUserGrantsSchema>;

export const deletePortalUserSchema = z.object({
  comment: z.string().min(1).max(255).optional(),
});

export type DeletePortalUserInput = z.infer<typeof deletePortalUserSchema>;
