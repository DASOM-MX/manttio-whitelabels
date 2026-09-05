import { z } from 'zod';

// `turnstileToken` is optional at the schema level and enforced by
// verifyTurnstileToken instead. A required-and-non-empty field rejected the
// request with a 400 *before* the service ran, which put it ahead of
// DEV_SKIP_TURNSTILE and left the local auth flows unusable even with the
// bypass on. Absent or empty is still refused in production — siteverify
// rejects an empty response — it now answers 403 turnstile_failed rather than
// a zod 400, which is the truer answer and leaks less of the schema.
export const portalLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  turnstileToken: z.string().optional(),
});

export const portalChangePasswordSchema = z.object({
  password: z.string().min(8),
});

export const portalForgotPasswordSchema = z.object({
  email: z.string().email(),
  turnstileToken: z.string().optional(),
});

export const portalResetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

export type PortalLoginInput = z.infer<typeof portalLoginSchema>;
export type PortalChangePasswordInput = z.infer<typeof portalChangePasswordSchema>;
export type PortalForgotPasswordInput = z.infer<typeof portalForgotPasswordSchema>;
export type PortalResetPasswordInput = z.infer<typeof portalResetPasswordSchema>;
