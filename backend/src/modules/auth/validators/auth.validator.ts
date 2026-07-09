import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Change-own (POST /auth/password): new password only — the caller is already
// JWT-authenticated with the temp password (backend plan §1).
export const changePasswordSchema = z.object({
  password: z.string().min(8),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
