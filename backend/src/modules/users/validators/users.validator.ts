import { z } from 'zod';
import { GRANTABLE_ROLES } from '../enums/users.enum';

// `role` accepts GRANTABLE_ROLES, not ROLES: `owner` is provisioning-time only
// and can never be granted through the users API (backend plan §1).
export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(GRANTABLE_ROLES),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    role: z.enum(GRANTABLE_ROLES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

export const deleteUserSchema = z.object({
  deleteComment: z.string().trim().min(1),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type DeleteUserInput = z.infer<typeof deleteUserSchema>;
