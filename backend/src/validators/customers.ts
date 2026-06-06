import { z } from 'zod';
import { MEXICAN_TIMEZONE_VALUES } from '../lib/timezones';

export const createCustomerSchema = z.object({
  name: z.string().min(1),
  identification: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  observation: z.string().optional(),
  address: z.string().optional(),
  state: z.string().optional(),
  razonSocial: z.string().optional(),
  timezone: z.enum(MEXICAN_TIMEZONE_VALUES).optional(),
});

export const updateCustomerSchema = createCustomerSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'no fields to update' });

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
