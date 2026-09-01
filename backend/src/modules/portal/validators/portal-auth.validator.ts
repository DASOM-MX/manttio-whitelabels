import { z } from 'zod';

export const portalLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const portalChangePasswordSchema = z.object({
  password: z.string().min(8),
});

export type PortalLoginInput = z.infer<typeof portalLoginSchema>;
export type PortalChangePasswordInput = z.infer<typeof portalChangePasswordSchema>;
