import { z } from 'zod';
import { MEXICAN_TIMEZONE_VALUES } from '../constants/timezones';
import { CustomerSource, CustomerStatus } from '../enums/customers.enum';

// RFC: 3 (moral) or 4 (física) letters + 6 date digits + 3 homoclave chars.
const RFC_PATTERN = /^[A-ZÑ&]{3,4}\d{6}[A-Z\d]{3}$/;

const contactSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1),
  role: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
});

// Fiscal is optional *as a whole*; once present, every field but billingEmail
// is required (all-or-nothing — the object shape enforces it, no partials).
const fiscalSchema = z.object({
  rfc: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .refine((v) => RFC_PATTERN.test(v), { message: 'invalid RFC' }),
  legalName: z.string().min(1),
  taxRegimeCode: z.string().min(1),
  fiscalZip: z.string().regex(/^\d{5}$/, 'fiscal zip must be 5 digits'),
  cfdiUseCode: z.string().min(1),
  billingEmail: z.string().email().optional(),
});

// Cross-field rules shared by create/update — applied only over the fields
// present in the payload (deeper enforcement against existing rows lives in the
// CRM status-transition endpoint, plan 08).
const withCrmRules = <T extends z.ZodTypeAny>(schema: T) =>
  schema.superRefine((val, ctx) => {
    const v = val as { status?: CustomerStatus; blacklistReason?: string };
    if (v.status === CustomerStatus.Blacklisted && !v.blacklistReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['blacklistReason'],
        message: 'blacklistReason is required when status is blacklisted',
      });
    }
  });

const customerFields = {
  name: z.string().min(1),
  contactName: z.string().optional(),
  identification: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  observation: z.string().optional(),
  address: z.string().optional(),
  state: z.string().optional(),
  razonSocial: z.string().optional(),
  timezone: z.enum(MEXICAN_TIMEZONE_VALUES).optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
  source: z.nativeEnum(CustomerSource).optional(),
  blacklistReason: z.string().optional(),
  nextFollowUpAt: z.string().datetime().optional(),
  tags: z.array(z.string().min(1)).optional(),
  contacts: z.array(contactSchema).optional(),
  fiscal: fiscalSchema.nullable().optional(),
};

export const createCustomerSchema = withCrmRules(z.object(customerFields));

export const updateCustomerSchema = withCrmRules(
  z.object(customerFields).partial().refine((v) => Object.keys(v).length > 0, {
    message: 'no fields to update',
  }),
);

export const deleteCustomerSchema = z.object({
  deleteComment: z.string().trim().min(1).optional(),
});

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
  search: z.string().trim().optional(),
  status: z.nativeEnum(CustomerStatus).optional(),
  source: z.nativeEnum(CustomerSource).optional(),
  // comma-separated on the wire (`?tags=a,b`); split + trimmed here.
  tags: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean)
        : undefined,
    ),
});

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;
export type DeleteCustomerInput = z.infer<typeof deleteCustomerSchema>;
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>;
export type CustomerContactInput = z.infer<typeof contactSchema>;
export type CustomerFiscalInput = z.infer<typeof fiscalSchema>;
