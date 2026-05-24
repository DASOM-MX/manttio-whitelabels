import { z } from 'zod';

export const ROLES = ['admin', 'technician'] as const;
export type Role = (typeof ROLES)[number];

export const TIMEZONES = [
  'UTC',
  'America/Monterrey',
  'America/Mexico_City',
  'America/Chicago',
] as const;
export type Timezone = (typeof TIMEZONES)[number];

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(ROLES),
  timezone: z.enum(TIMEZONES).optional(),
});

export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    role: z.enum(ROLES).optional(),
    timezone: z.enum(TIMEZONES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
