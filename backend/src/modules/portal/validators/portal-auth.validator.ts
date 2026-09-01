import { z } from 'zod';

export const portalLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  turnstileToken: z.string().min(1),
});

export const portalChangePasswordSchema = z.object({
  password: z.string().min(8),
});

export const portalForgotPasswordSchema = z.object({
  email: z.string().email(),
  turnstileToken: z.string().min(1),
});

export const portalResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export type PortalLoginInput = z.infer<typeof portalLoginSchema>;
export type PortalChangePasswordInput = z.infer<typeof portalChangePasswordSchema>;
export type PortalForgotPasswordInput = z.infer<typeof portalForgotPasswordSchema>;
export type PortalResetPasswordInput = z.infer<typeof portalResetPasswordSchema>;
