import { z } from 'zod';
import { PortalGrant } from '../enums/portal-grants.enum';

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

export const updatePortalUserStatusSchema = z.object({
  status: z.enum(['invited', 'active', 'suspended']),
});

export type UpdatePortalUserStatusInput = z.infer<typeof updatePortalUserStatusSchema>;

export const resetPortalUserPasswordSchema = z.object({});

export type ResetPortalUserPasswordInput = z.infer<typeof resetPortalUserPasswordSchema>;
