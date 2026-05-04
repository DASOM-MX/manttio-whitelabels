import { z } from 'zod';

export const ROLES = ['admin', 'technician'] as const;
export type Role = (typeof ROLES)[number];

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ROLES),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    role: z.enum(ROLES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
